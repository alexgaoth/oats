import React from "react";

/**
 * The id of the words that name the row a switch sits in. A settings row
 * provides it, so a switch with no label of its own is named by its row
 * instead of being announced as an unnamed switch.
 */
export const ToggleLabelContext = React.createContext<string | undefined>(undefined);
