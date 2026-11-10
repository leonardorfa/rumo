/**
 * Trava do app: Face ID pelo próprio iPhone (WebAuthn) e PIN como reserva.
 * É uma tranca local, não login de servidor: nada sai do aparelho.
 */


export async function hashPin(pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const toB64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64 = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export const faceIdSupported = () =>
  typeof window !== "undefined" && !!window.PublicKeyCredential && window.isSecureContext;

/** Cadastra o Face ID deste aparelho. Devolve o id da credencial. */
export async function registerFaceId(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32),
      rp: { name: "Rumo" },
      user: { id: rand(16), name: "rumo", displayName: "Rumo" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Não consegui cadastrar o Face ID.");
  return toB64(cred.rawId);
}

/** Pede o Face ID. true = reconheceu. */
export async function verifyFaceId(credId: string): Promise<boolean> {
  try {
    const got = await navigator.credentials.get({
      publicKey: {
        challenge: rand(32),
        allowCredentials: credId ? [{ type: "public-key", id: fromB64(credId) }] : [],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return !!got;
  } catch {
    return false; // cancelou ou não reconheceu: cai no PIN
  }
}
