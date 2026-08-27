export interface DatabaseStrategy<T> {
  connect(): Promise<T>;
  disconnect(): Promise<void>;
}
