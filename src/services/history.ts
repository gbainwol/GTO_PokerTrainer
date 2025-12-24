import { SpotDescriptor } from "../types/solver";

type EventType = "view" | "drill" | "leak";

export interface HistoryEvent {
  id: string;
  type: EventType;
  spot: SpotDescriptor;
  timestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface SyncAdapter {
  push: (pinned: SpotDescriptor[]) => Promise<void>;
  pull: () => Promise<SpotDescriptor[]>;
}

const STORAGE_KEY = "gto_history";
const PINNED_KEY = "gto_pinned_spots";

const safeLocalStorage = typeof window !== "undefined" ? window.localStorage : undefined;

const load = <T>(key: string, fallback: T): T => {
  try {
    const raw = safeLocalStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (error) {
    console.warn("HistoryService load error", error);
    return fallback;
  }
};

const save = <T>(key: string, value: T) => {
  try {
    safeLocalStorage?.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("HistoryService save error", error);
  }
};

export class HistoryService {
  private syncAdapter?: SyncAdapter;
  private events: HistoryEvent[];
  private pinned: SpotDescriptor[];

  constructor(syncAdapter?: SyncAdapter) {
    this.syncAdapter = syncAdapter;
    this.events = load<HistoryEvent[]>(STORAGE_KEY, []);
    this.pinned = load<SpotDescriptor[]>(PINNED_KEY, []);
  }

  record(event: HistoryEvent) {
    this.events = [event, ...this.events].slice(0, 200);
    save(STORAGE_KEY, this.events);
  }

  list(type?: EventType): HistoryEvent[] {
    return type ? this.events.filter((event) => event.type === type) : this.events;
  }

  pin(spot: SpotDescriptor) {
    if (this.pinned.find((item) => item.id === spot.id)) return;
    this.pinned = [spot, ...this.pinned];
    save(PINNED_KEY, this.pinned);
    this.syncAdapter?.push(this.pinned);
  }

  unpin(spotId: string) {
    this.pinned = this.pinned.filter((item) => item.id !== spotId);
    save(PINNED_KEY, this.pinned);
    this.syncAdapter?.push(this.pinned);
  }

  getPinned(): SpotDescriptor[] {
    return this.pinned;
  }

  async syncFromRemote() {
    if (!this.syncAdapter) return;
    const remote = await this.syncAdapter.pull();
    this.pinned = remote;
    save(PINNED_KEY, this.pinned);
  }
}

export default HistoryService;
