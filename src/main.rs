use std::{collections::HashMap, vec::Vec};

use rand::seq::SliceRandom;

fn main() {
    println!("Hello, world!");
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
        // ok waitActionScreen is interesting. how do you impl that.
    }
}

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