import type { Card, Pile, Player, Ring, CardNumber } from "./base";

type State = {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,

    circle: Ring<Player>,
    turn: Player,
    chances_remaining?: number,

    hands: Map<Player, Pile<Card>>,
};


const face_cards: {[key in CardNumber]?: number} = {
    "J": 1,
    "Q": 2,
    "K": 3,
    "A": 4,
};