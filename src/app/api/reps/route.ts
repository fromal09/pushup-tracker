import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`
      SELECT recorded_at AS ts, complete
      FROM reps
      ORDER BY recorded_at ASC
    `;
    return NextResponse.json(
      rows.map(r => ({
        ts:       new Date(r.ts as string).getTime(),
        complete: r.complete as boolean,
      }))
    );
  } catch (err) {
    console.error('GET /api/reps:', err);
    return NextResponse.json({ error: 'Failed to load reps' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { complete, recorded_at } = await req.json();
    const ts = recorded_at ? new Date(recorded_at) : new Date();

    await sql`
      INSERT INTO reps (recorded_at, complete)
      VALUES (${ts.toISOString()}, ${complete})
    `;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/reps:', err);
    return NextResponse.json({ error: 'Failed to save rep' }, { status: 500 });
  }
}
