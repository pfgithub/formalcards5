import { Pile, type Card, type Player, Ring, type CardNumber, type GameGenerator, unreachable, waitActionScreen, asc, error } from "./base";

type Variant = {
    allow_marriage: boolean,
    allow_divorse: boolean,

};

type State = {
    pile: Pile<Card>,

    circle: Ring<Player>,
    turn: Player,
    chances_remaining?: {owner: Player, count: number}, // arguably we don't need owner as it's just right(ccw) of the player, skipping any dead players

    hands: Map<Player, Pile<Card>>,
};


type Input = {
    deck: Pile<Card>,
    players: Ring<Player>,
};
type Output = {
    winner: Player,
};

function hand(state: State, player: Player): Pile<Card> {
    return state.hands.get(player) ?? unreachable("every player already has a hand at this point");
}
export function* game(input: Input): GameGenerator<Output> {
    const circle = new Ring();
    yield* circle.addClockwiseFrom(undefined, input.players.items());

    const pile = new Pile<Card>();
    yield* pile.addTop(input.deck.items());
    
    const state: State = {
        pile,

        circle,
        turn: circle.random() ?? unreachable("need at least two players"),

        hands: new Map(),
    };

    yield* state.pile.shuffle();

    // each player has a hand pile
    let deal_target = state.circle.clockwiseNext(state.turn);
    for (const player of state.circle.clockwiseStartingWith(deal_target)) {
        state.hands.set(player, new Pile());
    }
    
    // deal out every card to the two hands
    while (true) {
        const top = state.pile.top() ?? unreachable("there are cards");
        hand(state, deal_target).addTop([top]);
        if (state.pile.empty()) break; // done dealing
        deal_target = state.circle.clockwiseNext(deal_target);
    }

    // start with left of the dealer
    while (true) {
        const action = yield* waitActionScreen(asc.choose({
            slap: asc.record({actor: asc.actor()}),
            play: asc.record({actor: asc.actor( state.circle.items().filter(p => !hand(state, p).empty()) )}),
        }), function* (action) {return action});
        if (action.key === "slap") {
            if (validSlapTarget(state) || state.chances_remaining?.owner === action.value.actor) {
                // pass
                hand(state, action.value.actor).addBottom(state.pile.items());
                state.turn = action.value.actor;
                state.chances_remaining = undefined;
            } else {
                // fail
                if (pile.empty()) {
                    // it's okay to fail
                } else {
                    // it's not okay to fail. burninate
                    burn(state, action.value.actor);
                }
            }
        } else if (action.key === "play") {
            const peek_card = hand(state, state.turn).top() ?? error("turn is wrong, has a player with no cards");
            if (state.chances_remaining?.count === 0) {
                burn(state, action.value.actor);
            } else if (state.turn !== action.value.actor) {
                burn(state, action.value.actor);
            } else {
                state.pile.addTop([peek_card]);

                
                const face = face_cards[peek_card.number];
                if (face != null) {
                    // face card / success
                    state.chances_remaining = {owner: state.turn, count: face};
                    state.turn = state.circle.clockwiseNext(state.turn);
                } else if (state.chances_remaining != null) {
                    // nchances fail
                    state.chances_remaining.count -= 1;
                } else {
                    state.turn = state.circle.clockwiseNext(state.turn);
                }
            }
        }

        // skip any dead players for turn
        while (hand(state, state.turn).empty()) state.circle.clockwiseNext(state.turn);

        // detect win
        const active: Player[] = [];
        for (const player of state.circle.items()) if (!hand(state, player).empty()) active.push(player);
        if (active.length === 1) return {winner: active[0]!};
    }
}

function validSlapTarget(state: State): boolean {
    const [peekS1, peekS2, peekS3] = state.pile.topN(3);
    const [peekP1, peekP2] = state.pile.topN(2);
    if (peekP1 && peekP2 && compareKey(peekP1.number) === compareKey(peekP2.number)) {
        // pair/marriage
        return true;
    }
    if (peekS1 && peekS3 && compareKey(peekS1.number) === compareKey(peekS3.number)) {
        // sandwich/divorce
        return true;
    }
    return false;
}

function* burn(state: State, player: Player): GameGenerator<void> {
    const bottom_card = hand(state, player).bottom();
    if (!bottom_card) return; // kick the player out?
    state.pile.addBottom([bottom_card]);
}

const face_cards: {[key in CardNumber]?: number} = {
    "J": 1,
    "Q": 2,
    "K": 3,
    "A": 4,
};

function compareKey(k: CardNumber): string {
    if (k === "K" || k === "Q") return "M";
    return k;
}