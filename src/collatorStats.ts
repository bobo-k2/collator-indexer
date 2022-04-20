export class DailyStats {
  constructor(public date: Date, public blocksMissed: number) {}
}

export class CollatorStats {
  constructor () {
    this.stats = [];
  }

  id: string;
  name: string;
  stats: DailyStats[];
}