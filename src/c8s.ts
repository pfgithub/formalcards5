import { asc, effect, Effect, error, never, Pile, Ring, Unordered, unreachable, waitActionScreen, type Card, type CardSuit, type GameGenerator, type Player } from "./base";

// the state of the game
type State = {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,
    eight_suit?: CardSuit,

    circle: Ring<Player>,
    turn: Player,

    hands: Map<Player, Unordered<Card>>,
};

// an individual player's point of view (ie they can see their own cards but only the number of their opponent's cards)
type View = {
    // a player can see:
    // - the backsides of all cards in the draw pile
    // - the front and backs of all cards in the discard pile
    // - the turn order
    // - the cards in their hand
    // - the backsides of all cards in other players' hands
};

// what you need to start the game
type Input = {
    deck: Pile<Card>,
    players: Ring<Player>,
};
// what you get out of the game
type Output = {
    winner: Player,
};

function hand(state: State, player: Player): Unordered<Card> {
    return state.hands.get(player) ?? unreachable("every player already has a hand at this point");
}

function canPlay(state: State, card: Card): boolean {
    if (card.number === "8") return true; // you can always play an 8
    if (state.eight_suit != null) return card.suit === state.eight_suit; // on an 8 you have to match the suit
    const top = state.draw_pile.top();
    if (!top) return unreachable("there is always a top card");
    return card.number === top.number || card.suit === top.suit;
}

export function* game(input: Input): GameGenerator<Output> {
    // form a circle of players (implicitly: in random order) and select a dealer (implicitly: random, as it is the 'first' player in the circle)
    const circle = new Ring();
    yield* circle.initializeClockwise(input.players.items());

    const draw_pile = new Pile<Card>();
    yield* draw_pile.initialize(input.deck.items());
    
    const state: State = {
        draw_pile, // implicitly: in random order
        discard_pile: new Pile(),
        circle,
        turn: circle.random() ?? unreachable("need at least two players"),
        hands: new Map(),
    };

    // dealer (explicitly) shuffles the draw pile
    yield* state.draw_pile.shuffle();

    // each player has a hand
    for (const player of state.circle.items()) state.hands.set(player, new Unordered());

    // dealer deals seven cards to each player
    for (let i = 0; i < 7; i += 1) {
        for (const player of state.circle.items()) {
            const card = state.draw_pile.top() ?? error("not enough cards / too many players");
            yield* hand(state, player).add([card]);
        }
    }

    // dealer flips over the top card
    yield* state.discard_pile.addTop([state.draw_pile.top() ?? error("not enough cards / too many players")])

    // start with left of the dealer
    state.turn = state.circle.clockwiseNext(state.turn);
    
    try {while (true) {
        // the current player chooses whether to play or draw
        const action = yield* waitActionScreen(asc.choose({
            draw: asc.record({player: asc.actor([state.turn])}),
            play: asc.record({player: asc.actor([state.turn]), card: asc.enum(hand(state, state.turn).items())}),
        }), function* (action) {
            if (action.key === "play") if (!canPlay(state, action.value.card)) return "fail";
            return action;
        });
        if (action.key === "play") {
            yield* playCard(state, action.value.card);
        } else if (action.key === "draw") {
            const drawn_card = drawOrReshuffle(state);
            if (drawn_card) {
                // the current player may choose to immediately play the drawn card
                const action = yield* waitActionScreen(asc.choose({
                    pass: asc.record({player: asc.actor([state.turn])}),
                    play: asc.record({player: asc.actor(canPlay(state, drawn_card) ? [state.turn] : [])}),
                }), function* (action) { return action });
                if (action.key === "pass") {
                    if (drawn_card) yield* hand(state, state.turn).add([drawn_card]);
                } else if (action.key === "play") {
                    yield* playCard(state, drawn_card);
                } else never(action);
            }
        } else never(action);

        // play advances to the left
        state.turn = state.circle.clockwiseNext(state.turn);
    }} catch(e) {
        if (e instanceof WinEffect) {
            return {
                winner: e.winner,
            };
        } else throw e;
    }
}
function* playCard(state: State, card: Card): GameGenerator<void> {
    state.eight_suit = undefined; // this isn't a good way of explaining 8s even if it is accurate. maybe we can do better somehow.
    state.draw_pile.addTop([card]);
    if (hand(state, state.turn).empty()) yield* effect(new WinEffect(state.turn)); // you win when you play your last card
    if (card.number === "8") {
        const action = yield* waitActionScreen(asc.record({
            actor: asc.actor([state.turn]),
            suit: asc.enum(["D", "H", "C", "S"] as const),
        }), function* (action) {return action});
        state.eight_suit = action.suit;
    }
}

// we could have this handled by a hook rather than a function
function drawOrReshuffle(state: State): Card | undefined {
    const res = state.draw_pile.top();
    if (res) return res;
    const preserve = state.discard_pile.top();
    if (preserve) state.discard_pile.remove(preserve);
    for (const card of state.discard_pile.items()) state.draw_pile.addTop([card]);
    if (preserve) state.discard_pile.addTop([preserve]);
    state.draw_pile.shuffle();
    return state.draw_pile.top();
}

class WinEffect extends Effect<never> {
    constructor(public winner: Player) {super()}
}