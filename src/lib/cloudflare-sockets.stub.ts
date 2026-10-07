// Stub for the Cloudflare Workers-only "cloudflare:sockets" module.
// Only used in Docker/Node builds (DOCKER_BUILD=1) where worker-mailer is
// bundled but never executed — mail is sent via nodemailer there.
export function connect(): never {
  throw new Error("cloudflare:sockets is not available in the Node build");
}
