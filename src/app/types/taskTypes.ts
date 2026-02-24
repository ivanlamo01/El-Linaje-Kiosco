export interface Task {
  id: string;
  description: string;
  deadline: string;
  userId: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  importance: 'low' | 'medium' | 'high';
  createdAt: Date | { seconds: number; nanoseconds: number } | string | number;
  createdBy: string;
  deadline?: Date | { seconds: number; nanoseconds: number } | string | number;
}
