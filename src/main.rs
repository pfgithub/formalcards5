use std::{collections::HashMap, vec::Vec, any::Any};

use rand::seq::SliceRandom;

fn main() {
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
                (
                    stringify!($key),
                    action_screen!(@screen $($value)*)
                ),
            )*
        ])
    };
    (@resolve ($resolve:expr) @choose $name:ident { $(
        $key:ident ( $($value:tt)* ),
    )* }) => {
        match $resolve {
            $(
                ActionScreenResult::Choose((
                    stringify!($key),
                    value
                )) => $name::$key(
                    action_screen!(@resolve (value.as_ref()) $($value)*)
                ),
            )*
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
        ActionScreen::Record(vec![
            $(
                (
                    stringify!($key),
                    action_screen!(@screen $($value)*)
                ),
            )*
        ])
    };
    (@resolve ($resolve:expr) @record $name:ident { $(
        $key:ident: ($($value:tt)*),
    )* }) => {
        match $resolve {
            ActionScreenResult::Record(map) => $name {
                $(
                    $key: action_screen!(@resolve (
                        map.get(stringify!($key)).unwrap()
                    ) $($value)*),
                )*
            },
            _ => panic!("expected record"),
        }
    };

    // @actor
    (@typedef @actor $expr:expr) => {};
    (@typename @actor $expr:expr) => {Player};
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
    (@typename @enum <$typeclass:path> $expr:expr) => {$typeclass};
    (@screen @enum <$typeclass:path> $expr:expr) => {
        ActionScreen::Enum(($expr).iter().map(|item| Box::new(*item) as Box<dyn Any>).collect())
    };
    (@resolve ($resolve:expr) @enum <$typeclass:path> $expr:expr) => {
        match $resolve {
            ActionScreenResult::Enum(x) => *x.downcast_ref::<$typeclass>().expect("unreachable"),
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
        let $name = action_screen!(@resolve (raw) $($rest)*);
    };
}

macro_rules! make_action_screen {
    ($args:tt $($rest:tt)*) => {
        use super::*;
        action_screen!(@typedef $($rest)*);
        pub fn wait $args -> action_screen!(@typename $($rest)*) {
            let screen = action_screen!(@screen $($rest)*);
            let encoded = wait_action_screen(screen);
            action_screen!(@resolve (encoded) $($rest)*)
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
                Pass(@record ActionPass {
                    _actor: (@actor Some(vec![turn])),
                }),
                Play(@record ActionPlay {
                    _actor: (@actor Some(vec![turn])),
                    card: (@enum<Card> playable),
                }),
            });
        }
        let hand_cont = state.hand(state.turn).contents.clone();
        let allowed_cards = hand_cont.iter().filter_map(|card| {
            let card: Card = *card;
            if can_play(&state, card) {Some(card)} else {None}           
        }).collect();
        let action = base_action::wait(state.turn, allowed_cards);

        match action {
            base_action::Action::Play(play) => {
                play_card(&mut state, play.card);
            },
            base_action::Action::Pass(_) => {
                if let Some(drawn_card) = draw_or_reshuffle(&mut state) {
                    wait_action_screen!(let action = @choose InnerAction {
                        Pass(@record InnerActionPass {
                            _actor: (@actor Some(vec![state.turn])),
                        }),
                        Play(@record InnerActionPlay {
                            _actor: (@actor Some( if can_play(&state, drawn_card) {vec![state.turn]} else {vec![]})),
                        }),
                    });
                    match action {
                        InnerAction::Pass(_) => {
                            state.hand(state.turn).add(vec![drawn_card]);
                        },
                        InnerAction::Play(_) => {
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
        wait_action_screen!(let action = @record Action {
            _actor: (@actor Some(vec![state.turn])),
            suit: (@enum<CardSuit> vec![CardSuit::Diamonds, CardSuit::Spades, CardSuit::Hearts, CardSuit::Clubs]),
        });
        state.eight_suit = Some(action.suit);
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

trait ActionScreenOption {}

#[derive(Debug)]
enum ActionScreen {
    Choose(Vec<(&'static str, ActionScreen)>),
    Record(Vec<(&'static str, ActionScreen)>),
    Enum(Vec<Box<dyn Any>>),
    Actor(Option<Vec<Player>>),
}
enum ActionScreenResult {
    Choose((&'static str, Box<ActionScreenResult>)),
    Record(HashMap<&'static str, ActionScreenResult>),
    Enum(Box<dyn Any>),
    Actor(Player),
}
// wonder if we can make it typesafe somehow like the js one
// or better given that we can use numbers instead of string keys
fn wait_action_screen(screen: ActionScreen) -> ActionScreenResult {
    panic!("todo: wait_action_screen: {:?}", screen);
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
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
struct Player {
    id: u64,
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
struct Card {
    suit: CardSuit,
    number: CardNumber,
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
enum CardSuit {
    Hearts,
    Spades,
    Diamonds,
    Clubs,
}
#[derive(Copy, Clone, Debug, PartialEq, Eq, Hash)]
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