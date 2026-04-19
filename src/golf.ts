import { asc, effect, Effect, error, Grid, never, Pile, Ring, Unordered, unreachable, waitActionScreen, type Card, type CardSuit, type GameGenerator, type Player } from "./base";

// the state of the game
type State = {
    draw_pile: Pile<Card>,
    discard_pile: Pile<Card>,

    circle: Ring<Player>,
    turn: Player,

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

    // start left of the dealer
    state.turn = state.circle.clockwiseNext(state.turn);

    while (true) {
        yield* waitActionScreen(asc.choose({
            draw_pile: asc.record({actor: asc.actor([state.turn])}),
            draw_discard: asc.record({actor: asc.actor([state.turn])}),
        }));
        // TODO: draw the card
        yield* waitActionScreen(asc.choose({
            replace: asc.record({actor: asc.actor([state.turn]), pile: asc.enum(board(state, state.turn).items())}),
            discard: asc.record({actor: asc.actor([state.turn])}),
        }));
        // TODO: replace/discard the card
        // TODO: checkEnd()
    }
    // TODO: calculate score
}