import { NextResponse } from "next/server";

/**
 * GET /api/comments/:page/users?name= → mention autocomplete. Stubbed for now (returns no
 * suggestions); GitHub has no cheap "users who can be mentioned here" query. `@name` typed in a
 * comment still posts fine and GitHub auto-links real usernames.
 */
export function GET() {
  return NextResponse.json([]);
}
