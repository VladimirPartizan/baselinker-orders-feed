export async function GET() {
  return new Response(JSON.stringify({ message: "API работает" }), {
    headers: { "Content-Type": "application/json" }
  });
}
