export interface PushMessage {
  title: string;
  content?: string;
}

export interface PushResult {
  success: boolean;
  error?: string;
  provider: string;
}

export interface PushChannel {
  readonly provider: string;
  send(message: PushMessage): Promise<PushResult>;
}
