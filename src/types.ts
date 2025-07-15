export interface Chat {
  id?: number;
  content: string;
  tags?: string[];
  sender: string;
  senderId: number;
  replyToId?: number | null; // parent chat ID
}
