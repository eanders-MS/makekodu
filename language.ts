namespace kodu {

    export enum TileType {
        SENSOR = 1,
        FILTER = 2,
        ACTUATOR = 3,
        MODIFIER = 4
    };

    export interface Constraints {
        provides?: string[];
        requires?: string[];
        allow?: {
            tiles?: string[];
            categories?: string[];
        };
        disallow?: {
            tiles?: string[];
            categories?: string[];
        };
        handling?: { [id: string]: string | number | boolean };
    }

    export interface TileDefn {
        type: TileType;
        tid: string;
        name: string;
        weight?: number; // Influences sort order
        hidden?: boolean;   // Hide from UI?
        category?: string;
        constraints?: Constraints;
    }

    export type SensorDefn = TileDefn & {
        type: TileType.SENSOR;
        phase: "pre" | "post";  // whether to execute before or after filters evaluate.
    };
    export type FilterDefn = TileDefn & {
        type: TileType.FILTER;
        category: string;
        priority: number;   // for runtime reordering. 10 is default.
    };
    export type ActuatorDefn = TileDefn & { type: TileType.ACTUATOR; };
    export type ModifierDefn = TileDefn & {
        type: TileType.MODIFIER;
        category: string;
        priority: number;   // for runtime reordering. 10 is default.
    };

    export const RuleCondition = {
        DEFAULT: "RC0",
        HIGH: "RC1",
        LOW: "RC2",
        HIGH_TO_LOW: "RC3",
        LOW_TO_HIGH: "RC4"
    }

    export class RuleDefn {
        condition: string;
        sensor: SensorDefn;
        filters: FilterDefn[];
        actuator: ActuatorDefn;
        modifiers: ModifierDefn[];

        constructor() {
            this.condition = RuleCondition.DEFAULT;
            this.filters = [];
            this.modifiers = [];
        }

        public clone(): RuleDefn {
            const rule = new RuleDefn();
            rule.condition = this.condition;
            rule.sensor = this.sensor;
            rule.actuator = this.actuator;
            rule.filters = this.filters.slice(0);
            rule.modifiers = this.modifiers.slice(0);
            return rule;
        }

        public isEmpty(): boolean {
            return !this.sensor && !this.actuator;
        }

        public toObj(): any {
            const obj = {
                C: this.condition,
                S: this.sensor ? this.sensor.tid : undefined,
                A: this.actuator ? this.actuator.tid : undefined,
                F: this.filters.map(elem => elem.tid),
                M: this.modifiers.map(elem => elem.tid)
            };
            if (!obj.C) { delete obj.C; }
            if (!obj.S) { delete obj.S; }
            if (!obj.A) { delete obj.A; }
            if (!obj.F.length) { delete obj.F; }
            if (!obj.M.length) { delete obj.M; }
            return obj;
        }

        public static FromObj(obj: any): RuleDefn {
            if (typeof obj === 'string') {
                obj = JSON.parse(obj);
            }
            const defn = new RuleDefn;
            if (typeof obj["C"] === 'string') {
                defn.condition = obj["C"];
            }
            if (typeof obj["S"] === 'string') {
                defn.sensor = tiles.sensors[obj["S"]];
            }
            if (typeof obj["A"] === 'string') {
                defn.actuator = tiles.actuators[obj["A"]];
            }
            if (Array.isArray(obj["F"])) {
                const filters: any[] = obj["F"];
                defn.filters = filters.map((elem: string) => tiles.filters[elem]);
            }
            if (Array.isArray(obj["M"])) {
                const modifiers: any[] = obj["M"];
                defn.modifiers = modifiers.map((elem: string) => tiles.modifiers[elem]);
            }
            return defn;
        }
    }
    
    export class PageDefn {
        rules: RuleDefn[];

        constructor() {
            this.rules = [];
        }

        public clone(): PageDefn {
            const page = new PageDefn();
            page.rules = this.rules.map(rule => rule.clone());
            return page;
        }

        public trim() {
            while (this.rules.length && this.rules[this.rules.length - 1].isEmpty()) {
                this.rules.pop();
            }
        }

        public deleteRuleAt(index: number) {
            if (index >= 0 && index < this.rules.length) {
                this.rules.splice(index, 1);
            }
        }

        public toObj(): any {
            const obj = {
                R: this.rules.map(elem => elem.toObj())
            };
            if (!obj.R.length) {
                delete obj.R;
            }
            return obj;
        }

        public static FromObj(obj: any): PageDefn {
            if (typeof obj === 'string') {
                obj = JSON.parse(obj);
            }
            const defn = new PageDefn;
            if (Array.isArray(obj["R"])) {
                const rules: any[] = obj["R"];
                defn.rules = rules.map((elem: any) => RuleDefn.FromObj(elem));
            }
            return defn;
        }
    }

    export class BrainDefn {
        pages: PageDefn[];

        constructor() {
            this.pages = [0, 1, 2, 3, 4].map(n => new PageDefn());
        }

        public clone(): BrainDefn {
            const brain = new BrainDefn();
            brain.pages = this.pages.map(page => page.clone());
            return brain;
        }

        public trim() {
            this.pages.map(page => page.trim());
        }

        public toObj(): any {
            return {
                P: this.pages.map(elem => elem.toObj())
            };
        }

        public static FromObj(obj: any): BrainDefn {
            if (typeof obj === 'string') {
                obj = JSON.parse(obj);
            }
            const defn = new BrainDefn();
            if (obj && obj["P"] && Array.isArray(obj["P"])) {
                const pages: any[] = obj["P"];
                defn.pages = pages.map((elem: any) => PageDefn.FromObj(elem));
            }
            return defn;
        }
    }

    export class Language {
        public static getSensorSuggestions(rule: RuleDefn): SensorDefn[] {
            let sensors = Object.keys(tiles.sensors)
                .map(id => tiles.sensors[id])
                .filter(tile => !tile.hidden)
                .sort((a, b) => {
                    const wa = a.weight || 100;
                    const wb = b.weight || 100;
                    return wa - wb;
                });
            return sensors;
        }

        public static getFilterSuggestions(rule: RuleDefn, index: number): FilterDefn[] {
            let all = Object.keys(tiles.filters)
                .map(id => tiles.filters[id])
                .filter(tile => !tile.hidden)
                .sort((a, b) => {
                    const wa = a.weight || 100;
                    const wb = b.weight || 100;
                    return wa - wb;
                });

            // Collect existing tiles up to index.
            let existing: TileDefn[] = [];
            for (let i = 0; i < index; ++i) {
                existing.push(rule.filters[i]);
            }

            // Return empty set if the last existing tile is a "terminal".
            if (existing.length) {
                const last = existing[existing.length - 1];
                if (last.constraints && last.constraints.handling && last.constraints.handling["terminal"]) { return []; }
            }

            // Collect the built-up constraints.
            const constraints = mkConstraints();
            mergeConstraints(constraints, rule.sensor ? rule.sensor.constraints : null)
            for (let i = 0; i < existing.length; ++i) {
                mergeConstraints(constraints, existing[i].constraints);
            }

            return this.getCompatibleSet(all, constraints);
        }

        public static getActuatorSuggestions(rule: RuleDefn): ActuatorDefn[] {
            let actuators = Object.keys(tiles.actuators)
                .map(id => tiles.actuators[id])
                .filter(tile => !tile.hidden)
                .sort((a, b) => {
                    const wa = a.weight || 100;
                    const wb = b.weight || 100;
                    return wa - wb;
                });
            return actuators;
        }

        public static getModifierSuggestions(rule: RuleDefn, index: number): ModifierDefn[] {
            const all = Object.keys(tiles.modifiers)
                .map(id => tiles.modifiers[id])
                .filter(tile => !tile.hidden)
                .sort((a, b) => {
                    const wa = a.weight || 100;
                    const wb = b.weight || 100;
                    return wa - wb;
                });

            // Collect existing tiles up to index.
            let existing: TileDefn[] = [];
            for (let i = 0; i < index; ++i) {
                existing.push(rule.modifiers[i]);
            }

            // Return empty set if the last existing tile is a "terminal".
            if (existing.length) {
                const last = existing[existing.length - 1];
                if (last.constraints && last.constraints.handling && last.constraints.handling["terminal"]) { return []; }
            }

            // Collect the built-up constraints.
            const constraints = mkConstraints();
            mergeConstraints(constraints, rule.actuator ? rule.actuator.constraints : null);
            mergeConstraints(constraints, rule.sensor ? rule.sensor.constraints : null)
            for (let i = 0; i < existing.length; ++i) {
                mergeConstraints(constraints, existing[i].constraints);
            }

            return this.getCompatibleSet(all, constraints);
        }

        private static getCompatibleSet<T extends TileDefn>(all: T[], c: Constraints): T[] {
            let compat = all
                // Filter "requires" to matching "provides".
                .filter(tile => {
                    if (!tile.constraints) return true;
                    if (!tile.constraints.requires) return true;
                    let met = false;
                    tile.constraints.requires.forEach(req => met = met || c.provides.some(pro => pro === req));
                    return met;
                })
                // Filter "allows".
                .filter(tile => c.allow.categories.some(cat => cat === tile.category) || c.allow.tiles.some(tid => tid === tile.tid))
                // Filter "disallows".
                .filter(tile => !c.disallow.categories.some(cat => cat === tile.category) && !c.disallow.tiles.some(tid => tid === tile.tid));
        
            // TODO: c.handling

            return compat;
        }

        public static ensureValid(rule: RuleDefn) {
            if (!rule.sensor) {
                rule.filters = [];
            }
            if (!rule.actuator) {
                rule.modifiers = [];
            }
        }
    }

    function mkConstraints(): Constraints {
        const c: Constraints = {
            provides: [],
            requires: [],
            allow: {
                tiles: [],
                categories: []
            },
            disallow: {
                tiles: [],
                categories: []
            },
            handling: { }
        };
        return c;
    }

    function mergeConstraints(dst: Constraints, src?: Constraints) {
        if (!src) { return; }
        if (src.provides) {
            src.provides.forEach(item => dst.provides.push(item));
        }
        if (src.requires) {
            src.requires.forEach(item => dst.requires.push(item));
        }
        if (src.allow) {
            (src.allow.tiles || []).forEach(item => dst.allow.tiles.push(item));
            (src.allow.categories || []).forEach(item => dst.allow.categories.push(item));
        }
        if (src.disallow) {
            (src.disallow.tiles || []).forEach(item => dst.disallow.tiles.push(item));
            (src.disallow.categories || []).forEach(item => dst.disallow.categories.push(item));
        }
        if (src.handling) {
            const keys = Object.keys(src.handling);
            for (const key of keys) {
                dst.handling[key] = src.handling[key];
            }
        }
    }

    type SensorMap = { [id: string]: SensorDefn; };
    type FilterMap = { [id: string]: FilterDefn; };
    type ActuatorMap = { [id: string]: ActuatorDefn; };
    type ModifierMap = { [id: string]: ModifierDefn; };

    export type TileDatabase = {
        sensors: SensorMap;
        filters: FilterMap;
        actuators: ActuatorMap;
        modifiers: ModifierMap;
    };

    // Once a tid is assigned, it can NEVER BE CHANGED OR REPURPOSED.
    // Every tid must be unique in the set of all tids.
    export const tid = {
        sensor: <any>{
            always: "S1",
            see: "S2",
            bump: "S3",
            dpad: "S4",
            button_a: "S5",
            button_b: "S6",
            timer: "S7",
        },
        filter: <any>{
            kodu: "F1",
            tree: "F2",
            apple: "F3",
            nearby: "F4",
            faraway: "F5",
            me: "F6",
            it: "F7",
            timespan_short: "F8",
            timespan_long: "F9",
            express_none: "F10",
            express_happy: "F11",
            express_angry: "F12",
            express_heart: "F13",
            express_sad: "F14",
        },
        actuator: <any>{
            move: "A1",
            switch_page: "A2",
            express: "A3",
            boom: "A4",
            vanish: "A5",
            camera_follow: "A6",
        },
        modifier: <any>{
            me: "M1",
            it: "M2",
            kodu: "M3",
            tree: "M4",
            apple: "M5",
            quickly: "M6",
            slowly: "M7",
            toward: "M8",
            away: "M9",
            avoid: "M10",
            page_1: "M11",
            page_2: "M12",
            page_3: "M13",
            page_4: "M14",
            page_5: "M15",
            express_none: "M16",
            express_happy: "M17",
            express_angry: "M18",
            express_heart: "M19",
            express_sad: "M20",
        }
    }

    export const tiles: TileDatabase = {
        sensors: {
		    [tid.sensor.always]: {
                type: TileType.SENSOR,
                tid: tid.sensor.always,
                name: "Always",
                phase: "pre",
                hidden: true
            },
            [tid.sensor.see]: {
                type: TileType.SENSOR,
                tid: tid.sensor.see,
                name: "See",
                phase: "pre",
                weight: 1,
                constraints: {
                    provides: ["target"],
                    allow: {
                        categories: ["subject", "direct-subject", "distance", "expression"]
                    },
                    disallow: {
                        tiles: [tid.filter.me]
                    }
                }
            },
            [tid.sensor.bump]: {
                type: TileType.SENSOR,
                tid: tid.sensor.bump,
                name: "Bump",
                phase: "pre",
                weight: 2,
                constraints: {
                    provides: ["target"],
                    allow: {
                        categories: ["subject", "direct-subject", "expression"]
                    },
                    disallow: {
                        tiles: [tid.filter.me]
                    }
                }
            },
            [tid.sensor.dpad]: {
                type: TileType.SENSOR,
                tid: tid.sensor.dpad,
                name: "DPad",
                phase: "pre",
                constraints: {
                    provides: ["input", "direction"],
                    allow: {
                        categories: ["dpad-direction", "button-event"]
                    }
                }
            },
            [tid.sensor.button_a]: {
                type: TileType.SENSOR,
                tid: tid.sensor.button_a,
                name: "A",
                phase: "pre",
                constraints: {
                    provides: ["input"],
                    allow: {
                        categories: ["button-event"]
                    }
                }
            },
            [tid.sensor.button_b]: {
                type: TileType.SENSOR,
                tid: tid.sensor.button_b,
                name: "B",
                phase: "pre",
                constraints: {
                    provides: ["input"],
                    allow: {
                        categories: ["button-event"]
                    }
                }
            },
            [tid.sensor.timer]: {
                type: TileType.SENSOR,
                tid: tid.sensor.timer,
                name: "Timer",
                phase: "post",
                constraints: {
                    allow: {
                        categories: ["timespan"]
                    }
                }
            }
        },
        filters: {
            [tid.filter.kodu]: {
                type: TileType.FILTER,
                tid: tid.filter.kodu,
                name: "Kodu",
                category: "subject",
                priority: 10,
                constraints: {
                    provides: ["target"],
                    disallow: {
                        categories: ["subject", "direct-subject"]
                    }
                }
            },
            [tid.filter.tree]: {
                type: TileType.FILTER,
                tid: tid.filter.tree,
                name: "Tree",
                category: "subject",
                priority: 10,
                constraints: {
                    provides: ["target"],
                    disallow: {
                        categories: ["subject", "direct-subject"]
                    }
                }            },
            [tid.filter.apple]: {
                type: TileType.FILTER,
                tid: tid.filter.apple,
                name: "Apple",
                category: "subject",
                priority: 10,
                constraints: {
                    provides: ["target"],
                    disallow: {
                        categories: ["subject", "direct-subject"]
                    }
                }
            },
            [tid.filter.nearby]: {
                type: TileType.FILTER,
                tid: tid.filter.nearby,
                name: "nearby",
                category: "distance",
                priority: 10,
                constraints: {
                    provides: ["target"],
                    disallow: {
                        tiles: [tid.filter.faraway]
                    },
                    handling: {
                        "max-count": 3
                    }
                }
            },
            [tid.filter.faraway]: {
                type: TileType.FILTER,
                tid: tid.filter.faraway,
                name: "far away",
                category: "distance",
                priority: 10,
                constraints: {
                    provides: ["target"],
                    disallow: {
                        tiles: [tid.filter.nearby]
                    },
                    handling: {
                        "max-count": 3
                    }
                }
            },
            [tid.filter.timespan_short]: {
                type: TileType.FILTER,
                tid: tid.filter.timespan_short,
                name: "short",
                category: "timespan",
                priority: 10,
                constraints: {
                }
            },
            [tid.filter.timespan_long]: {
                type: TileType.FILTER,
                tid: tid.filter.timespan_long,
                name: "long",
                category: "timespan",
                priority: 10,
                constraints: {
                }
            },
            [tid.filter.express_none]: {
                type: TileType.FILTER,
                tid: tid.filter.express_none,
                name: "none",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.filter.express_none]: {
                type: TileType.FILTER,
                tid: tid.filter.express_none,
                name: "none",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.filter.express_happy]: {
                type: TileType.FILTER,
                tid: tid.filter.express_happy,
                name: "happy",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.filter.express_angry]: {
                type: TileType.FILTER,
                tid: tid.filter.express_angry,
                name: "angry",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.filter.express_heart]: {
                type: TileType.FILTER,
                tid: tid.filter.express_heart,
                name: "heart",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.filter.express_sad]: {
                type: TileType.FILTER,
                tid: tid.filter.express_sad,
                name: "sad",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["expression"]
                    }
                }
            },
        },
        actuators: {
            [tid.actuator.move]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.move,
                name: "Move",
                category: "movement",
                constraints: {
                    allow: {
                        categories: ["speed", "direction", "direct-object"]
                    }
                }
            },
            [tid.actuator.switch_page]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.switch_page,
                name: "Switch page",
                constraints: {
                    allow: {
                        categories: ["page"]
                    }
                }
            },
            [tid.actuator.express]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.express,
                name: "Express",
                constraints: {
                    allow: {
                        categories: ["expression"]
                    }
                }
            },
            [tid.actuator.boom]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.boom,
                name: "Boom",
                hidden: true,   // Not implemented yet
                constraints: {
                    allow: {
                        categories: ["direct-object"]
                    }
                }
            },
            [tid.actuator.vanish]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.vanish,
                name: "Vanish",
                constraints: {
                    allow: {
                        categories: ["direct-object"]
                    }
                }
            },
            [tid.actuator.camera_follow]: {
                type: TileType.ACTUATOR,
                tid: tid.actuator.camera_follow,
                name: "Keep in view",
                constraints: {
                    allow: {
                        categories: ["direct-object"]
                    }
                }
            }
        },
        modifiers: {
            [tid.modifier.me]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.me,
                name: "me",
                category: "direct-object",
                priority: 10,
                constraints: {
                    produces: ["direct-target"],
                    requires: ["target"],
                    disallow: {
                        categories: ["object", "direct-object"]
                    }
                }
            },
            [tid.modifier.it]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.it,
                name: "it",
                category: "direct-object",
                priority: 10,
                constraints: {
                    produces: ["direct-target"],
                    requires: ["target"],
                    disallow: {
                        categories: ["object", "direct-object"]
                    }
                }
            },
            [tid.modifier.kodu]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.kodu,
                name: "Kodu",
                category: "object",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["object", "direct-object"]
                    }
                }
            },
            [tid.modifier.tree]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.tree,
                name: "Tree",
                category: "object",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["object", "direct-object"]
                    }
                }
            },
            [tid.modifier.apple]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.apple,
                name: "Apple",
                category: "object",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: ["object", "direct-object"]
                    }
                }
            },
            [tid.modifier.quickly]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.quickly,
                name: "quickly",
                category: "speed",
                priority: 10,
                constraints: {
                    disallow: {
                        tiles: [tid.modifier.slowly]
                    },
                    handling: {
                        "max-count": 3
                    }
                }
            },
            [tid.modifier.slowly]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.slowly,
                name: "slowly",
                category: "speed",
                priority: 10,
                constraints: {
                    disallow: {
                        tiles: [tid.modifier.quickly]
                    },
                    handling: {
                        "max-count": 3
                    }
                }
            },
            [tid.modifier.toward]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.toward,
                name: "toward",
                category: "direction",
                priority: 10,
                constraints: {
                    requires: ["target"],
                    disallow: {
                        tiles: [tid.modifier.me],
                        categories: ["direction"]
                    }
                }
            },
            [tid.modifier.away]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.away,
                name: "away",
                category: "direction",
                priority: 10,
                constraints: {
                    requires: ["target"],
                    disallow: {
                        tiles: [tid.modifier.me],
                        categories: ["direction"]
                    }
                }
            },
            [tid.modifier.avoid]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.avoid,
                name: "avoid",
                category: "direction",
                priority: 20,   // greater priority, appear after other modifiers
                constraints: {
                    requires: ["target"],
                    disallow: {
                        tiles: [tid.modifier.me],
                        categories: ["direction"]
                    }
                }
            },
            [tid.modifier.page_1]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.page_1,
                name: "page 1",
                category: "page",
                priority: 10,
                constraints: {
                    handling: {
                        "terminal": true
                    }
                }
            },
            [tid.modifier.page_2]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.page_2,
                name: "page 2",
                category: "page",
                priority: 10,
                constraints: {
                    handling: {
                        "terminal": true
                    }
                }
            },
            [tid.modifier.page_3]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.page_3,
                name: "page 3",
                category: "page",
                priority: 10,
                constraints: {
                    handling: {
                        "terminal": true
                    }
                }
            },
            [tid.modifier.page_4]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.page_4,
                name: "page 4",
                category: "page",
                priority: 10,
                constraints: {
                    handling: {
                        "terminal": true
                    }
                }
            },
            [tid.modifier.page_5]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.page_5,
                name: "page 5",
                category: "page",
                priority: 10,
                constraints: {
                    handling: {
                        "terminal": true
                    }
                }
            },
            [tid.modifier.express_none]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.express_none,
                name: "none",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: [ "expression" ]
                    }
                }
            },
            [tid.modifier.express_happy]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.express_happy,
                name: "happy",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: [ "expression" ]
                    }
                }
            },
            [tid.modifier.express_angry]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.express_angry,
                name: "angry",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: [ "expression" ]
                    }
                }
            },
            [tid.modifier.express_heart]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.express_heart,
                name: "heart",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: [ "expression" ]
                    }
                }
            },
            [tid.modifier.express_sad]: {
                type: TileType.MODIFIER,
                tid: tid.modifier.express_sad,
                name: "sad",
                category: "expression",
                priority: 10,
                constraints: {
                    disallow: {
                        categories: [ "expression" ]
                    }
                }
            },
        }
    }
}
