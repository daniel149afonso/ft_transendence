/**
 * PlayerState.ts — état global du joueur partagé entre toutes les scènes.
 *
 * Les HP sont lus au début de chaque scène (create) et mis à jour à chaque
 * fois que le joueur reçoit des dégâts.  Un reset() est appelé quand le
 * joueur redémarre après un Game Over.
 */
export const playerState = {
    hp:    6,
    maxHp: 6,

    reset() {
        this.hp = this.maxHp;
    },
};
