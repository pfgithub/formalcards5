#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")] // hide console window on Windows in release
use std::{any::Any, cell::RefCell, collections::HashMap, rc::Rc, vec::Vec};

use rand::seq::SliceRandom;

use serde::{Serialize, Deserialize};

use eframe::egui;

fn main() {
    env_logger::init();

    println!("Hello, world!");
    let mut input = Input {
        deck: Pile::<Card>::new(),
        players: Ring::<Player>::new(),
    };
    for suit in vec![CardSuit::Clubs, CardSuit::Spades, CardSuit::Hearts, CardSuit::Diamonds] {
        for number in vec![
            CardNumber::A,
            CardNumber::_2,
            CardNumber::_3,
            CardNumber::_4,
            CardNumber::_5,
            CardNumber::_6,
            CardNumber::_7,
            CardNumber::_8,
            CardNumber::_9,
            CardNumber::_10,
            CardNumber::J,
            CardNumber::Q,
            CardNumber::K,
        ] {
            input.deck.add(vec![Card {suit, number}]);
        }
    }
    input.players.add(vec![
        Player{id: 0},
        Player{id: 1},
        Player{id: 2},
        Player{id: 3},
    ]);
    let output = game(&mut input).expect("todo error");
    println!("Output: {:?}", output);
}

// supposedly it's possible to get completions in macros
// https://github.com/rust-lang/rust-analyzer/issues/11058
macro_rules! action_screen {
    // @choose
    (@typedef @choose $name:ident { $(
        $key:ident ( $($value:tt)* ),
    )* }) => {
        $(action_screen!(@typedef $($value)*);)*
        pub enum $name {
            $(
                $key (action_screen!(@typename $($value)*)),
            )*
        }
    };
    (@typename @choose $name:ident { $(
        $key:ident ( $($value:tt)* ),
    )* }) => {$name};
    (@screen @choose $name:ident { $(
        $key:ident ( $($value:tt)* ),
    )* }) => {
        ActionScreen::Choose(vec![
            $(
                ActionScreenNamed {
                    name: stringify!($key).to_string(),
                    screen: action_screen!(@screen $($value)*),
                },
            )*
        ])
    };
    (@resolve ($resolve:expr) @choose $name:ident { $(
        $key:ident ( $($value:tt)* ),
    )* }) => {
        match $resolve {
            ActionScreenResult::Choose((
                index,
                value
            )) => 'choose: {
                let i: usize = 0;
                $(
                    if (*index == i) {
                        break 'choose $name::$key(
                            action_screen!(@resolve (value.as_ref()) $($value)*)
                        );
                    }
                )*
                panic!("bad action screen result");
            },
            // ActionScreenResult::Choose()
            _ => panic!("bad action screen result"),
        }
    };

    // @record
    // note that for record it requires parenthesis around the value.
    // ideally it wouldn't, but we would need a tt that consumes everything except ','.
    // you can do that with tt munching but that looks like it sucks.
    (@typedef @record $name:ident { $(
        $key:ident: ($($value:tt)*),
    )* }) => {
        $(action_screen!(@typedef $($value)*);)*
        pub struct $name {
            $(
                pub $key: action_screen!(@typename $($value)*),
            )*
        }
    };
    (@typename @record $name:ident { $(
        $key:ident: ($($value:tt)*),
    )* }) => {$name};
    (@screen @record $name:ident { $(
        $key:ident: ($($value:tt)*),
    )* }) => {
        ActionScreen::Record({
            vec![$(
                ActionScreenNamed {
                    name: stringify!($key).to_string(),
                    screen: action_screen!(@screen $($value)*),
                },
            )*
        ]})
    };
    (@resolve ($resolve:expr) @record $name:ident { $(
        $key:ident: ($($value:tt)*),
    )* }) => {
        match $resolve {
            ActionScreenResult::Record(list) => {let mut i: usize = 0; $name {
                $(
                    $key: action_screen!(@resolve (
                        &list[{let tmp = i; i += 1; _ = i; tmp}] // macro_metavar_expr or similar would let us use $(index())
                    ) $($value)*),
                )*
            }},
            _ => panic!("expected record"),
        }
    };

    // @actor
    (@typedef @actor $expr:expr) => {};
    (@typename @actor $expr:expr) => {usize};
    (@screen @actor $expr:expr) => {
        ActionScreen::Actor($expr)
    };
    (@resolve ($resolve:expr) @actor $expr:expr) => {
        match $resolve {
            ActionScreenResult::Actor(actor) => *actor,
            _ => panic!("expected actor"),
        }
    };

    // @enum
    (@typedef @enum <$typeclass:path> $expr:expr) => {};
    (@typename @enum <$typeclass:path> $expr:expr) => {usize};
    (@screen @enum <$typeclass:path> $expr:expr) => {
        ActionScreen::Enum(($expr).iter().map(|item| Box::new(*item) as Box<dyn ActionScreenOption>).collect())
    };
    (@resolve ($resolve:expr) @enum <$typeclass:path> $expr:expr) => {
        match $resolve {
            ActionScreenResult::Enum(x) => *x, // *x.as_any().downcast_ref::<$typeclass>().expect("unreachable"),
            _ => panic!("expected enum"),
        }
    };

    // @raw
    (@typedef @raw $rest:expr) => {};
    (@typename @raw $rest:expr) => {ActionScreenResult};
    (@screen @raw $rest:expr) => {$rest};
    (@resolve ($resolve:expr) @raw $rest:expr) => {$resolve};

    // @never
    (@typedef @never) => {};
    (@typename @never) => {!};
    (@screen @never) => {ActionScreen::Enum(vec![])};
    (@resolve ($resolve:expr) @never) => {panic!("unreachable")};
}

macro_rules! wait_action_screen {
    (let $name:ident = $($rest:tt)*) => {
        let action = action_screen!(@screen $($rest)*);
        let raw = wait_action_screen(action);
        action_screen!(@typedef $($rest)*);
        let $name = action_screen!(@resolve (&raw) $($rest)*);
    };
}

macro_rules! make_action_screen {
    ($args:tt $($rest:tt)*) => {
        use super::*;
        action_screen!(@typedef $($rest)*);
        pub fn wait $args -> action_screen!(@typename $($rest)*) {
            let screen = action_screen!(@screen $($rest)*);
            let encoded = wait_action_screen(screen);
            action_screen!(@resolve (&encoded) $($rest)*)
        }
    }
}

fn game(input: &mut Input) -> Result<Output, Error> {
    let mut circle = Ring::<Player>::new();
    circle.add(input.players.take_all());
    let mut draw_pile = Pile::<Card>::new();
    draw_pile.add(input.deck.take_all());
    let turn = circle.first().expect("uh oh");

    let mut state = State {
        draw_pile: draw_pile,
        discard_pile: Pile::<Card>::new(),
        eight_suit: None,

        circle: circle,
        turn: turn,

        hands: HashMap::new(),
    };

    state.draw_pile.shuffle();

    for player in state.circle.clockwise_after(state.turn) {
        state.hands.insert(player, Unordered::new());
    }

    for _ in 0..7 {
        for player in state.circle.clockwise_after(state.turn) {
            let card = state.draw_pile.take_top().ok_or_else(|| Error::Cards)?;
            state.hand(player).add(vec![card]);
        }
    }

    let added = state.draw_pile.take_top().ok_or_else(|| Error::Cards)?;
    state.draw_pile.add(vec![added]);

    state.turn = *state.circle.clockwise_after(state.turn).first().expect(">=1 player");

    loop {
        mod base_action {
            make_action_screen!((turn: Player, playable: Vec<Card>) @choose Action {
                Draw(@record ActionDraw {
                    _actor: (@actor vec![turn]),
                }),
                Play(@record ActionPlay {
                    _actor: (@actor vec![turn]),
                    card: (@enum<Card> playable),
                }),
            });
        }
        let hand_cont = state.hand(state.turn).contents.clone();
        let allowed_cards: Vec<Card> = hand_cont.iter().filter_map(|card| {
            let card: Card = *card;
            if can_play(&state, card) {Some(card)} else {None}           
        }).collect();
        let action = base_action::wait(state.turn, allowed_cards.clone());

        match action {
            base_action::Action::Play(play) => {
                play_card(&mut state, allowed_cards[play.card]);
            },
            base_action::Action::Draw(_a) => {
                if let Some(drawn_card) = draw_or_reshuffle(&mut state) {
                    wait_action_screen!(let action = @choose InnerAction {
                        Pass(@record InnerActionPass {
                            _actor: (@actor vec![state.turn]),
                        }),
                        Play(@record InnerActionPlay {
                            _actor: (@actor if can_play(&state, drawn_card) {vec![state.turn]} else {vec![]}),
                        }),
                    });
                    match action {
                        InnerAction::Pass(_a) => {
                            state.hand(state.turn).add(vec![drawn_card]);
                        },
                        InnerAction::Play(_a) => {
                            play_card(&mut state, drawn_card);
                        },
                    };
                }
            },
        }
    }
}
fn play_card(state: &mut State, card: Card) -> () {
    state.eight_suit = None;
    state.draw_pile.add(vec![card]);
    if state.hand(state.turn).contents.is_empty() {
        // TODO: win game
    }
    if card.number == CardNumber::_8 {
        let suit_vec: Vec<CardSuit> = vec![CardSuit::Diamonds, CardSuit::Spades, CardSuit::Hearts, CardSuit::Clubs];
        wait_action_screen!(let action = @record Action {
            _actor: (@actor vec![state.turn]),
            suit: (@enum<CardSuit> suit_vec),
        });
        state.eight_suit = Some(suit_vec[action.suit]);
    }
}
fn can_play(state: &State, card: Card) -> bool {
    if card.number == CardNumber::_8 {return true};
    if let Some(eight_suit) = state.eight_suit {return card.suit == eight_suit};
    let top = state.draw_pile.peek_top().expect("there is always a card on top of discard");
    return card.number == top.number || card.suit == top.suit;
}
fn draw_or_reshuffle(state: &mut State) -> Option<Card> {
    if let Some(t) = state.draw_pile.take_top() {
        return Some(t);
    }
    let prev = state.discard_pile.take_top();
    state.draw_pile.add(state.discard_pile.take_all());
    if let Some(prev) = prev {
        state.discard_pile.add(vec![prev]);
    }
    state.draw_pile.take_top()
}

#[typetag::serde(tag = "kind")]
trait ActionScreenOption: std::fmt::Debug + Any {
    fn as_any(&self) -> &dyn Any;
}

#[derive(Debug, Serialize, Deserialize)]
struct ActionScreenNamed {
    name: String,
    screen: ActionScreen,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
enum ActionScreen {
    Choose(Vec<ActionScreenNamed>),
    Record(Vec<ActionScreenNamed>),
    Enum(Vec<Box<dyn ActionScreenOption>>),
    Actor(Vec<Player>),
}
#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
enum ActionScreenResult {
    Choose((usize, Box<ActionScreenResult>)),
    Record(Vec<ActionScreenResult>),
    Enum(usize),
    Actor(usize),
}
// wonder if we can make it typesafe somehow like the js one
// or better given that we can use numbers instead of string keys
fn wait_action_screen(screen: ActionScreen) -> ActionScreenResult {
    let serialized = serde_json::to_string(&screen).unwrap();
    let result: Rc<RefCell<Option<ActionScreenResult>>> = Rc::new(RefCell::new(None));

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default().with_inner_size([320.0, 240.0]),
        ..Default::default()
    };

    eframe::run_native(
        "My egui App",
        options,
        Box::new(|cc| {
            // This gives us image support:
            egui_extras::install_image_loaders(&cc.egui_ctx);

            Ok(Box::<MyApp>::new(MyApp::new(screen, serialized.clone(), result.clone())))
        }),
    ).expect("todo err");
    
    match result.take() {
        Some(n) => n,
        None => panic!("invalid"),
    }
}

#[derive(Debug)]
enum Error {
    Cards,
}

trait Owned {
    fn remove(&mut self, value: &mut dyn Owned) -> ();
    fn set_owner(&mut self, value: &mut dyn Owned) -> ();
}

struct State {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,
    eight_suit: Option<CardSuit>,

    circle: Ring<Player>,
    turn: Player,

    hands: HashMap<Player, Unordered<Card>>,
}
impl State {
    fn hand(&mut self, player: Player) -> &mut Unordered<Card> {
        self.hands.get_mut(&player).unwrap()
    }
}
#[derive(Debug, Serialize, Deserialize)]
struct Views {
    contents: HashMap<Player, PlayerView>,
}
#[derive(Debug, Serialize, Deserialize)]
struct PlayerView {
    view: GenericView,
    screen: Option<ActionScreen>,
}
#[derive(Debug, Serialize, Deserialize)]
struct NamedView {
    name: String,
    contents: GenericView,
}
#[derive(Debug, Serialize, Deserialize)]
enum GenericView {
    Group(Vec<NamedView>),
    Pile(Vec<Option<Card>>),
    Ring(Vec<GenericView>),
    Player(Player),
}
struct View {
    player: Player,
    hand_cards: Pile<Card>,
    discard_cards: Pile<Card>,
    draw_count: usize,
    circle: Ring<Player>,
}
struct Input {
    deck: Pile<Card>,
    players: Ring<Player>,
}
#[derive(Debug)]
struct Output {
    winner: Player,
}
struct Pile<T: Copy> {
    contents: Vec<T>,
}
impl<T: Copy> Pile<T> {
    fn new() -> Pile<T> {
        Pile { contents: vec![] }
    }
    fn add(&mut self, items: Vec<T>) -> () {
        self.contents.extend_from_slice(&items[..]);
    }
    fn take_all(&mut self) -> Vec<T> {
        let copy = self.contents.clone();
        self.contents = vec![];
        copy
    }
    fn shuffle(&mut self) -> () {
        let mut rng = rand::rng();
        self.contents.shuffle(&mut rng);
    }
    fn peek_top(&self) -> Option<T> {
        self.contents.last().copied()
    }
    fn take_top(&mut self) -> Option<T> {
        self.contents.pop()
    }
}
struct Ring<T: Copy + PartialEq> {
    contents: Vec<T>,
}
impl<T: Copy + PartialEq> Ring<T> {
    fn new() -> Ring<T> {
        Ring { contents: vec![] }
    }
    fn add(&mut self, items: Vec<T>) -> () {
        self.contents.extend_from_slice(&items[..]);
    }
    fn first(&self) -> Option<T> {
        self.contents.first().copied()
    }
    fn take_all(&mut self) -> Vec<T> {
        let copy = self.contents.clone();
        self.contents = vec![];
        copy
    }
    // this could be an iterator instead of copying the vector
    fn clockwise_after(&mut self, from: T) -> Vec<T> {
        let index = self.contents.iter().position(|x| *x == from).unwrap();
        let mut res = vec![];
        res.extend_from_slice(&self.contents[index..]);
        res.extend_from_slice(&self.contents[..index]);
        res
    }
}
struct Unordered<T> {
    contents: Vec<T>,
}
impl<T: Copy> Unordered<T> {
    fn new() -> Unordered<T> {
        Unordered { contents: vec![] }
    }
    fn add(&mut self, items: Vec<T>) -> () {
        self.contents.extend_from_slice(&items[..]);
    }
    fn take_all(&mut self) -> Vec<T> {
        let copy = self.contents.clone();
        self.contents = vec![];
        copy
    }
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct Player {
    id: u64,
}
#[typetag::serde]
impl ActionScreenOption for Player {
    fn as_any(&self) -> &dyn Any { self }
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
struct Card {
    suit: CardSuit,
    number: CardNumber,
}
#[typetag::serde]
impl ActionScreenOption for Card {
    fn as_any(&self) -> &dyn Any { self }
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
enum CardSuit {
    Hearts,
    Spades,
    Diamonds,
    Clubs,
}
#[typetag::serde]
impl ActionScreenOption for CardSuit {
    fn as_any(&self) -> &dyn Any { self }
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
enum CardNumber {
    A,
    _2,
    _3,
    _4,
    _5,
    _6,
    _7,
    _8,
    _9,
    _10,
    J,
    Q,
    K,
}

#[derive(Debug)]
enum ActionScreenResultProgress {
    Choose((Option<usize>, Vec<ActionScreenResultProgress>)),
    Record(Vec<ActionScreenResultProgress>),
    Enum(Option<usize>),
    Actor(Option<usize>), // this should be '()' because the screen will only be shown to the actor
}

struct MyApp {
    screen: ActionScreen,
    result: ActionScreenResultProgress,
    json: String,
    outcome: Rc<RefCell<Option<ActionScreenResult>>>,
}

impl MyApp {
    fn new(screen: ActionScreen, json: String, outcome: Rc<RefCell<Option<ActionScreenResult>>>) -> Self {
        let result = action_screen_result_init(&screen);
        Self {
            screen,
            result,
            json,
            outcome,
        }
    }
}

impl eframe::App for MyApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        egui::CentralPanel::default().show_inside(ui, |ui| {
            ui.heading("My egui Application");
            ui.horizontal(|ui| {
                let name_label = ui.label("JSON: ");
                ui.text_edit_singleline(&mut self.json)
                    .labelled_by(name_label.id);
            });
            ui.label(format!("source: {}", self.json));

            action_screen_ui(ui, &self.screen, &mut self.result);

            if let Some(result) = action_screen_result(&self.screen, &self.result) {
                ui.label(format!("result: {}", serde_json::to_string(&result).unwrap()));
                // currently, this is {"kind":"Choose","value":[1,{"kind":"Record","value":[{"kind":"Actor","value":0},{"kind":"Enum","value":0}]}]}
                // it could be [1,[0,0]] if we modify the serialization
                // and then use the custom generated ActionResult from the macro for deserialization
                *self.outcome.borrow_mut() = Some(result);
            } else {
                ui.label("errors remain");
                *self.outcome.borrow_mut() = None;
            }


            // ui.add(egui::Slider::new(&mut self.age, 0..=120).text("age"));
            // if ui.button("Increment").clicked() {
            //     self.age += 1;
            // }
            // ui.label(format!("Hello '{}', age {}", self.name, self.age));
        });
    }
}
fn action_screen_result_init(screen: &ActionScreen) -> ActionScreenResultProgress {
    match screen {
        ActionScreen::Choose(choices) => {
            ActionScreenResultProgress::Choose((None, choices.iter().map(|choice| {
                action_screen_result_init(&choice.screen)
            }).collect()))
        },
        ActionScreen::Record(entries) => {
            ActionScreenResultProgress::Record(entries.iter().map(|entry| {
                action_screen_result_init(&entry.screen)
            }).collect())
        },
        ActionScreen::Enum(_) => {
            ActionScreenResultProgress::Enum(None)
        },
        ActionScreen::Actor(_) => {
            ActionScreenResultProgress::Actor(None)
        },
    }
}
fn action_screen_ui(ui: &mut egui::Ui, screen: &ActionScreen, result: &mut ActionScreenResultProgress) {
    match screen {
        ActionScreen::Choose(choices) => {
            let nt = match result {ActionScreenResultProgress::Choose(x) => x, _ => panic!("wrong")};
            ui.horizontal_wrapped(|ui| {
                for (i, choice) in choices.iter().enumerate() {
                    if ui.add(egui::Button::selectable(nt.0 == Some(i), choice.name.clone())).clicked() {
                        nt.0 = if nt.0 == Some(i) {None} else {Some(i)};
                    }
                }
            });
            if let Some(index) = nt.0 {
                egui::CollapsingHeader::new(choices[index].name.clone())
                    .default_open(true)
                    .show(ui, |ui| {
                        action_screen_ui(ui, &choices[index].screen, &mut nt.1[index])
                    });
            };
        },
        ActionScreen::Record(entries) => {
            let nt = match result {ActionScreenResultProgress::Record(x) => x, _ => panic!("wrong")};
            for (index, entry) in entries.iter().enumerate() {
                egui::CollapsingHeader::new(entry.name.clone())
                    .default_open(true)
                    .show(ui, |ui| {
                        action_screen_ui(ui, &entries[index].screen, &mut nt[index]);
                    });
            };
        },
        ActionScreen::Enum(options) => {
            let nt = match result {ActionScreenResultProgress::Enum(x) => x, _ => panic!("wrong")};
            ui.horizontal_wrapped(|ui| {
                for (index, entry) in options.iter().enumerate() {
                    if ui.add(egui::Button::selectable(*nt == Some(index), format!("{}", serde_json::to_string(entry).unwrap()))).clicked() {
                        *nt = if *nt == Some(index) {None} else {Some(index)};
                    }
                }
            });
        },
        ActionScreen::Actor(options) => {
            let nt = match result {ActionScreenResultProgress::Actor(x) => x, _ => panic!("wrong")};
            ui.horizontal_wrapped(|ui| {
                for (index, entry) in options.iter().enumerate() {
                    if ui.add(egui::Button::selectable(*nt == Some(index), format!("{}", entry.id))).clicked() {
                        *nt = if *nt == Some(index) {None} else {Some(index)};
                    }
                }
            });
        },
    }
}

fn action_screen_result(screen: &ActionScreen, result: &ActionScreenResultProgress) -> Option<ActionScreenResult> {
    match screen {
        ActionScreen::Choose(choices) => {
            let nt = match result {ActionScreenResultProgress::Choose(x) => x, _ => panic!("wrong")};
            if let Some(index) = nt.0 {
                Some(ActionScreenResult::Choose((
                    index,
                    Box::<ActionScreenResult>::new(action_screen_result(&choices[index].screen, &nt.1[index])?),
                )))
            } else {
                None
            }
        },
        ActionScreen::Record(entries) => {
            let nt = match result {ActionScreenResultProgress::Record(x) => x, _ => panic!("wrong")};
            let mut result: Vec<ActionScreenResult> = Vec::with_capacity(entries.len());
            for (i, item) in entries.iter().enumerate() {
                result.push(action_screen_result(&item.screen, &nt[i])?);
            }
            Some(ActionScreenResult::Record(result))
        },
        ActionScreen::Enum(_) => {
            let nt = match result {ActionScreenResultProgress::Enum(x) => x, _ => panic!("wrong")};
            Some(ActionScreenResult::Enum((*nt)?))
        },
        ActionScreen::Actor(_) => {
            let nt = match result {ActionScreenResultProgress::Actor(x) => x, _ => panic!("wrong")};
            Some(ActionScreenResult::Actor((*nt)?))
        },
    }
}
