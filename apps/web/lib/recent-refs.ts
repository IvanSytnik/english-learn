/**
 * How many recently shown items (or vocabulary cards) a player asks the next
 * selection to skip. One number for both sides: the players keep this many
 * refs and the actions decrypt this many (`slice(-RECENT_EXCLUDE)`), so a
 * client never sends refs the server would drop. Client-safe, no imports.
 */
export const RECENT_EXCLUDE = 3;
