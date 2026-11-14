export type ToastType = 'pending' | 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  type: ToastType;
  sheetName?: string;
  timestamp: string;
}

type ToastListener = (toasts: ToastMessage[]) => void;

export class ToastManager {
  private static instance: ToastManager;
  private toasts: ToastMessage[] = [];
  private listeners: ToastListener[] = [];

  private constructor() {}

  public static getInstance(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager();
    }
    return ToastManager.instance;
  }

  public subscribe(listener: ToastListener): () => void {
    this.listeners.push(listener);
    listener(this.toasts);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l([...this.toasts]));
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

    this.toasts = [newToast, ...this.toasts.slice(0, 4)];
    this.notify();

    if (type !== 'pending') {
      setTimeout(() => {
        this.dismiss(id);
      }, 4500);
    }

    return id;
  }

  public update(id: string, title: string, type: ToastType, description?: string) {
    this.toasts = this.toasts.map((t) =>
      t.id === id
        ? {
            ...t,
            title,
            type,
            description: description !== undefined ? description : t.description,
          }
        : t
    );
    this.notify();

    if (type !== 'pending') {
      setTimeout(() => {
        this.dismiss(id);
      }, 4500);
    }
  }

  public dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }
}
