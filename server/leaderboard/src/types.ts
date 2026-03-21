export interface Player {
  username: string;
  wins: number;
  losses: number;
  draws: number;
  created_at: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
}

export interface VerifyRequest {
  username: string;
  password: string;
}

export interface RecordResultRequest {
  winner: string;
  loser: string;
  draw?: boolean;
}
