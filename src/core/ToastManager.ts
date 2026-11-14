export type ToastType = 'pending' | 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  sheetName?: string;
  timestamp: string;
  queuedCount?: number;
}

type ToastListener = (toasts: ToastMessage[]) => void;

/**
 * Single-slot FIFO Toast Queue Manager.
 * Guarantees at most 1 toast is visible at any instant; additional toasts
 * wait cleanly in a FIFO queue and display sequentially one after another.
 */
export class ToastManager {
  private static instance: ToastManager;
  private activeToast: ToastMessage | null = null;
  private queue: ToastMessage[] = [];
  private listeners: ToastListener[] = [];
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSafetyTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly AUTO_DISMISS_MS = 3800;
  private static readonly PENDING_TIMEOUT_MS = 28000;

  private constructor() {}

  public static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  public subscribe(listener: ToastListener): () => void {
    this.listeners.push(listener);
    listener(this.getVisibleSnapshot());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private getVisibleSnapshot(): ToastMessage[] {
    if (!this.activeToast) return [];
    return [
      {
        ...this.activeToast,
        queuedCount: this.queue.length,
      },
    ];
  }

  private notify() {
    const snapshot = this.getVisibleSnapshot();
    this.listeners.forEach((l) => l(snapshot));
  }

  private clearTimer() {
    if (this.dismissTimer !== null) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
    if (this.pendingSafetyTimer !== null) {
      clearTimeout(this.pendingSafetyTimer);
      this.pendingSafetyTimer = null;
    }
  }

  private scheduleAutoDismiss(toast: ToastMessage) {
    this.clearTimer();
    const targetId = toast.id;

    if (toast.type === 'pending') {
      // Safety net: never allow a pending toast to jam the single-slot FIFO queue indefinitely
      this.pendingSafetyTimer = setTimeout(() => {
        if (this.activeToast && this.activeToast.id === targetId && this.activeToast.type === 'pending') {
          this.update(
            targetId,
            'Waktu Proses Melebihi Batas',
            'error',
            'Permintaan terlalu lama merespons. Silakan periksa koneksi dan coba lagi.'
          );
        }
      }, ToastManager.PENDING_TIMEOUT_MS);
      return;
    }

    this.dismissTimer = setTimeout(() => {
      this.dismiss(targetId);
    }, ToastManager.AUTO_DISMISS_MS);
  }

  private promoteNextFromQueue() {
    this.clearTimer();
    if (this.queue.length > 0) {
      const nextToast = this.queue.shift()!;
      this.activeToast = nextToast;
      this.notify();
      this.scheduleAutoDismiss(nextToast);
    } else {
      this.activeToast = null;
      this.notify();
    }
  }

  public show(
    title: string,
    type: ToastType = 'info',
    description?: string,
    sheetName?: string
  ): string {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newToast: ToastMessage = {
      id,
      title,
      description,
      type,
      sheetName,
      timestamp: new Date().toLocaleTimeString('id-ID'),
    };

    if (!this.activeToast) {
      this.activeToast = newToast;
      this.notify();
      this.scheduleAutoDismiss(newToast);
    } else {
      // Queue behind active toast so only 1 toast is visible at a time
      this.queue.push(newToast);
      this.notify();
    }

    return id;
  }

  public update(id: string, title: string, type: ToastType, description?: string) {
    if (this.activeToast && this.activeToast.id === id) {
      this.activeToast = {
        ...this.activeToast,
        title,
        type,
        description: description !== undefined ? description : this.activeToast.description,
        timestamp: new Date().toLocaleTimeString('id-ID'),
      };
      this.notify();
      this.scheduleAutoDismiss(this.activeToast);
      return;
    }

    let foundInQueue = false;
    this.queue = this.queue.map((t) => {
      if (t.id === id) {
        foundInQueue = true;
        return {
          ...t,
          title,
          type,
          description: description !== undefined ? description : t.description,
          timestamp: new Date().toLocaleTimeString('id-ID'),
        };
      }
      return t;
    });

    if (foundInQueue) {
      this.notify();
    }
  }

  public dismiss(id: string) {
    if (this.activeToast && this.activeToast.id === id) {
      this.promoteNextFromQueue();
      return;
    }

    const beforeLen = this.queue.length;
    this.queue = this.queue.filter((t) => t.id !== id);
    if (this.queue.length !== beforeLen) {
      this.notify();
    }
  }
}
