import { NextResponse } from "next/server";
import { AppError } from "@smartreach/shared";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(err: unknown) {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: err.message, code: err.code },
      { status: err.statusCode },
    );
  }
  console.error(err);
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL" },
    { status: 500 },
  );
}
