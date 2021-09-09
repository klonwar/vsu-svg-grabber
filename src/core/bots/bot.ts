import {StateItem} from "#src/core/state-item";

export interface Bot {
  sendMessage: (item: StateItem) => Promise<void>
}