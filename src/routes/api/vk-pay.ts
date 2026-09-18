import { createFileRoute } from "@tanstack/react-router";
import { packById } from "@/lib/notes";
import { creditPack } from "@/lib/notes-db.server";
import { verifyPaymentSig } from "@/lib/vk/session.server";

function fieldsFrom(request: Request, raw: string) {
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  const url = new URL(request.url);
  for (const [k, v] of url.searchParams.entries()) if (!(k in out)) out[k] = v;
  return out;
}

function ok(body: unknown) {
  return Response.json(body);
}

function fail(code: number, msg: string) {
  return Response.json({ error: { error_code: code, error_msg: msg } });
}

async function handle(request: Request) {
  const raw = await request.text();
  const fields = fieldsFrom(request, raw);
  if (!process.env.VK_SECURE_KEY?.trim()) return fail(10, "payments off");
  if (!verifyPaymentSig(fields)) {
    return fail(10, "bad sig");
  }
  const type = fields.notification_type || fields.notificationType || "";
  const item = fields.item || fields.item_id || "";
  const pack = packById(item);

  if (type === "get_item" || type === "get_item_test") {
    if (!pack) return fail(20, "unknown item");
    return ok({
      response: {
        item_id: pack.id,
        title: pack.title,
        photo_url: "https://butylka.vercel.app/favicon.svg",
        price: pack.votes,
        expiration: 0,
      },
    });
  }

  if (type === "order_status_change" || type === "order_status_change_test") {
    const status = fields.status || "";
    const orderId = fields.order_id || "";
    const vkId = fields.user_id || fields.receiver_id || "";
    if (status !== "chargeable") {
      return ok({ response: { order_id: Number(orderId) || orderId } });
    }
    if (!pack || !vkId || !orderId) return fail(20, "bad order");
    const credited = await creditPack(vkId, `${type}:${orderId}`, item);
    if (!credited.ok) return fail(1, credited.error);
    return ok({
      response: {
        order_id: Number(orderId) || orderId,
        app_order_id: Date.now(),
      },
    });
  }

  return fail(11, "unknown notification");
}

export const Route = createFileRoute("/api/vk-pay")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
