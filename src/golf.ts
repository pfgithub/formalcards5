import { asc, effect, Effect, error, Grid, never, Pile, Ring, Unordered, unreachable, waitActionScreen, type Card, type CardSuit, type CardNumber, type GameGenerator, type Player } from "./base";

// the state of the game
type State = {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,

    circle: Ring<Player>,
    turn: Player,
    end_at?: Player,

    boards: Map<Player, Grid<Pile<Card>>>,
};

type Input = {
    deck: Pile<Card>,
    players: Ring<Player>,
};
type Output = {
    scores: Map<Player, number>,
};

function board(state: State, player: Player): Grid<Pile<Card>> {
    return state.boards.get(player) ?? unreachable("every player already has a board at this point");
}
export function* game(input: Input): GameGenerator<Output> {
    const circle = new Ring();
    yield* circle.addClockwiseFrom(undefined, input.players.items());

    const draw_pile = new Pile<Card>();
    yield* draw_pile.addTop(input.deck.items());
    
    const state: State = {
        draw_pile,
        discard_pile: new Pile(),

        circle,
        turn: circle.random() ?? unreachable("need at least two players"),

        boards: new Map(),
    };

    yield* state.draw_pile.shuffle();

    // each player has a board
    for (const player of state.circle.items()) {
        state.boards.set(player, new Grid(4, 2));
    }

    // deal 8 to each player to fill the board
    for (let i = 0; i < 8; i += 1) {
        for (const player of state.circle.items()) {
            const pile = new Pile<Card>();
            pile.add(state.draw_pile.topN(1));
            board(state, player).add([pile]);
        }
    }
    
    // deal the top card
    state.draw_pile.add(state.draw_pile.topN(1));

    // start left of the dealer
    state.turn = state.circle.clockwiseNext(state.turn);

    while (state.turn !== state.end_at) {
        const action = yield* waitActionScreen(asc.choose({
            draw_pile: asc.record({actor: asc.actor([state.turn])}),
            draw_discard: asc.record({actor: asc.actor([state.turn])}),
        }), function* (action) {return action});
        let card: Card;
        if (action.key === "draw_pile") {
            card = state.draw_pile.top() ?? error("uh oh");
            state.draw_pile.remove(card);
            if (state.draw_pile.empty()) {
                // shuffle discard pile into draw pile
                const top_discard = state.discard_pile.top() ?? error("uh oh!");
                state.draw_pile.add(state.discard_pile.items());
                state.draw_pile.shuffle();
            }
        } else if (action.key === "draw_discard") {
            card = state.discard_pile.top() ?? error("uh oh");
            state.discard_pile.remove(card);
        } else never(action);
        // TODO: draw the card
        const sub = yield* waitActionScreen(asc.choose({
            replace: asc.record({actor: asc.actor([state.turn]), pile: asc.enum(board(state, state.turn).items())}),
            discard: asc.record({actor: asc.actor([state.turn])}),
        }), function* (action) {return action});
        if (sub.key === "discard") {
            state.discard_pile.add([card]);
        } else if (sub.key === "replace") {
            state.discard_pile.add(sub.value.pile.items());
            sub.value.pile.add([card]);
        }

        // TODO: checkEnd
        if (board(state, state.turn).items().every(item => {
            // TODO: check if the item is face up
            return false;
        })) {
            state.end_at = state.turn;
        }

        // advance turn
        state.turn = state.circle.clockwiseNext(state.turn);
    }
    
    const scores = new Map<Player, number>();
    for (const player of state.circle.clockwiseStartingWith(state.turn)) {
        const player_board = board(state, player);
        let score = 0;
        let dream: CardNumber | undefined;
        for (let x = 0; x < 4; x += 1) {
            const top = (player_board.get(x, 1) ?? error("oops")).items()[0] ?? error("oops");
            const bottom = (player_board.get(x, 0) ?? error("oops")).items()[0] ?? error("oops");
            if (top.number === bottom.number) {
                if (dream === top.number) {
                    score += -20;
                    dream = undefined;
                    // not the most clear way to explain it. ideally we want to say you can pattern
                    // match a square anywhere you want as long as it doesn't overlap? this is a fine definition though.
                } else {
                    score += 0;
                    dream = top.number;
                }
            } else {
                score += scoreValues[top.number];
                score += scoreValues[bottom.number];
            }
        }
        scores.set(player, score);
    }
    return {scores};
}

const scoreValues: {[key in CardNumber]: number} = {
    "A": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    "J": 0,
    "Q": 13,
    "K": 0,
};
