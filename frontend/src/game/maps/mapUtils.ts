/**
 * mapUtils.ts — helpers pour lire les données Tiled et convertir
 * les coordonnées Tiled (px source 16×16) vers les coordonnées écran (800×600).
 */

export const MAP_W    = 800;
export const MAP_H    = 600;
export const COLS     = 30;
export const ROWS     = 20;
export const SRC_TILE = 16; // tilewidth/tileheight dans Tiled

// Facteurs d'échelle source → écran
export const SCALE_X = MAP_W / (COLS * SRC_TILE); // 800/480 ≈ 1.667
export const SCALE_Y = MAP_H / (ROWS * SRC_TILE); // 600/320 = 1.875

// ── Types Tiled ──────────────────────────────────────────────────────────────

export type TiledProp = {
    name:  string;
    type:  string;
    value: string | number | boolean;
};

export type TiledObject = {
    id:          number;
    name:        string;
    type:        string;
    x:           number;
    y:           number;
    width:       number;
    height:      number;
    properties?: TiledProp[];
    point?:      boolean;
    visible?:    boolean;
};

export type TiledLayer = {
    id:      number;
    name:    string;
    type:    string;          // "tilelayer" | "objectgroup"
    data?:   number[];        // tilelayer
    objects?: TiledObject[];  // objectgroup
};

// ── Conversions ───────────────────────────────────────────────────────────────

/** Coordonnées Tiled (pixels source) → coordonnées écran */
export function toScreen(tx: number, ty: number) {
    return { x: tx * SCALE_X, y: ty * SCALE_Y };
}

/** Centre écran d'un objet rectangle Tiled */
export function objCenter(obj: TiledObject) {
    return {
        x: (obj.x + obj.width  / 2) * SCALE_X,
        y: (obj.y + obj.height / 2) * SCALE_Y,
    };
}

/** Taille écran d'un objet rectangle Tiled */
export function objScreenSize(obj: TiledObject) {
    return { w: obj.width * SCALE_X, h: obj.height * SCALE_Y };
}

// ── Accès aux layers ─────────────────────────────────────────────────────────

/** Retourne les objets visibles d'un objectgroup nommé */
export function getObjects(layers: TiledLayer[], layerName: string): TiledObject[] {
    const layer = layers.find(l => l.name === layerName && l.type === "objectgroup");
    return (layer?.objects ?? []).filter(o => o.visible !== false);
}

/** Retourne le tableau de tuiles d'un tilelayer nommé */
export function getTileData(layers: TiledLayer[], layerName: string): number[] {
    const layer = layers.find(l => l.name === layerName && l.type === "tilelayer");
    return layer?.data ?? [];
}

/** Lit une propriété d'un objet Tiled */
export function getProp<T = string>(obj: TiledObject, propName: string): T | undefined {
    return obj.properties?.find(p => p.name === propName)?.value as T | undefined;
}
