
export class Owned {
    _owner: Area<Owned> | undefined = undefined;
    constructor() {}
}
export class Area<T extends Owned> extends Owned {
    #contents: T[] = [];
    #hooks: (() => GameGenerator<void>)[] = [];
    constructor() {
        super();
    }
    items(): T[] {return this.#contents}

    _own(item: T) {
        if (item._owner) item._owner.remove(item);
        item._owner = this;
    }
    * remove(item: T): GameGenerator<void> {
        const idx = this.#contents.indexOf(item);
        if (idx === -1) unreachable("can't remove; not in");
        this.#contents.splice(idx, 1);
        yield* this._updated();
    }
    * _updated(): GameGenerator<void> {
        for (const hook of this.#hooks) yield* hook();
    }
    
    random(): T | undefined {
        return this.items()[Math.random() * this.items().length |0];
    }
    has(item: T): boolean {return this.#contents.includes(item)}

    empty(): boolean {return this.#contents.length === 0}

    onUpdate(cb: (a: Area<T>) => GameGenerator<void>): void {
        // this really wants algebraic effects but GameGenerator<void> should suffice
        // we can basically fully simulate algebraic effects using GameGenerator<void> and some global variables if we want
        // actually yeah that's a good idea imo
        this.#hooks.push(() => cb(this));
    }

    * shuffle(): GameGenerator<void> {
        jsShuffle(this.items());
        yield* this._updated();
    }
    
    * add(items: T[]): GameGenerator<void> {
        for (const item of items) this._own(item);
        for (const item of items) this.items().push(item);
        yield* this._updated();
    }
}
export class Single<T extends Owned> extends Area<T> {
    constructor() {super()}
}
export class Grid<T extends Owned> extends Area<T> {
    constructor(public width: number, public height: number) {super()}

    get(x: number, y: number): T | undefined {
        return this.items()[y * this.width + x];
    }
}
export class Unordered<T extends Owned> extends Area<T> {
    constructor() {super()}
}
export class Pile<T extends Owned> extends Area<T> {
    constructor() {super()}
    
    below(item: T): T | undefined {
        const idx = this.items().indexOf(item);
        if (idx === -1) unreachable("can't below; not in pile");
        return this.items()[idx - 1];
    }
    top(): T | undefined {
        return this.items()[this.items().length - 1];
    }
    topN(n: number): T[] {
        return this.items().slice(Math.max(0, this.items().length - n));
    }
    * addTop(items: T[]): GameGenerator<void> {
        yield* this.add(items);
    }
}
export class Ring<T extends Owned> extends Area<T> {
    constructor() {super()}
    * addClockwiseFrom(start: undefined, items: T[]): GameGenerator<void> {
        if (start === undefined && this.items().length !== 0) throw new Error("ring not empy");
        return yield* this.add(items);
    }

    offset(item: T, direction: "cw" | "ccw", offset: number): T {
        const idx = this.items().indexOf(item);
        if (idx === -1) unreachable("can't after; not in pile");
        return this.items()[jsMod(idx + offset * (direction === "ccw" ? -1 : 1), this.items().length)]!;
    }
    clockwiseNext(item: T): T {
        return this.offset(item, "cw", 1);
    }
    clockwiseStartingWith(item: T): T[] {
        const it = this.items();
        const idx = this.items().indexOf(item);
        if (idx === -1) unreachable("can't after; not in pile");
        return [...it.slice(idx), ...it.slice(0, idx)];
    }
}

export type CardSuit = "D" | "H" | "C" | "S";
export type CardNumber = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
export class Card extends Owned {
    // TODO facing: Player | "table", front_face: "face" | "back"
    // ^ that's not really accurate. it's more like 'who is allowed to look at which faces of these cards'
    constructor(public suit: CardSuit, public number: CardNumber) {super()}
}
export class Player extends Owned {}



export type GameGenerator<T> = Generator<GameYieldArg, T, GameYieldRet>;

export type FnArgData<Fn extends (player: Player, data: any) => unknown> = Fn extends (player: Player, a0: infer T) => unknown ? T : never;

export type ActionScreen<T> = {_hint: T, value:
    | {kind: "choose", entries: Record<string, ActionScreen<unknown>>}
    | {kind: "record", entries: Record<string, ActionScreen<unknown>>}
    | {kind: "list", entries: ActionScreen<unknown>, min?: number, exact?: number}
    | {kind: "actor", of?: Player[]}
    | {kind: "enum", of: unknown[]}
};
export type Constructor<T> = {new(...args: any[]): T};
export const asc = {
    choose<Entries extends Record<string, ActionScreen<unknown>>>(entries: Entries): ActionScreen<{[key in keyof NoInfer<Entries>]: {key: key, value: NoInfer<Entries>[key]["_hint"]}}[keyof NoInfer<Entries>]> {
        return {
            _hint: 0 as any,
            value: {kind: "choose", entries},
        };
    },
    record<Entries extends Record<string, ActionScreen<unknown>>>(entries: Entries): ActionScreen<{[key in keyof NoInfer<Entries>]: NoInfer<Entries>[key]["_hint"]}> {
        return {
            _hint: 0 as any,
            value: {kind: "record", entries},
        };
    },
    list<Entry>(entries: ActionScreen<Entry>, filters?: {min?: number, exact?: number}): ActionScreen<Entry[]> {
        return {
            _hint: 0 as any,
            value: {kind: "list", entries, min: filters?.min, exact: filters?.exact},
        };
    },
    actor(of?: Player[]): ActionScreen<Player> {
        return {
            _hint: 0 as any,
            value: {kind: "actor", of},
        };
    },
    enum<T>(of: T[]): ActionScreen<T> {
        return {
            _hint: 0 as any,
            value: {kind: "enum", of},
        };
    }
};

export function jsAllUnique<T>(items: T[]): boolean {
    return new Set(items).size === items.length;
}

export function* waitActionScreen<T, U>(screen: ActionScreen<T>, validate?: (res: NoInfer<T>) => GameGenerator<U | "fail">): GameGenerator<NoInfer<U>> {
    error("todo");
}

export type GameYieldArg = {todo2: true};
export type GameYieldRet = {todo: true};

// this can't happen but it is mentioned in the rules
export function error(msg: string): never {
    throw new Error(msg);
}
// this can't happen - it's not mentioned in the rules
export function unreachable(why: string): never {
    error(why);
}
export function never(v: never): never {
    unreachable("never");
}


export class Effect<Result> extends Error {
    _result: Result;
    constructor() {
        super("effect");
        this._result = 0 as any;
    }
}
export function* effect<Result>(effect: Effect<Result>): GameGenerator<NoInfer<Result>> {
    throw effect; // TODO: we will need a custom handlers map, we can't use throw. we will only throw if the effect needs to exit and not continue.
    // we'll probably need handleEffects to be a generator or something
}

export function jsShuffle<T>(array: T[]): T[] {
    let current_index = array.length;
    while (current_index != 0) {
        const random_index = Math.floor(Math.random() * current_index);
        current_index--;

        [array[current_index], array[random_index]] = [array[random_index]!, array[current_index]!];
    }
  
    return array;
};
export function jsMod(a: number, n: number): number {
    return ((a % n) + n) % n;
}
