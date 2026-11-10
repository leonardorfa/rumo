"use client";

import { useEffect, useState } from "react";
import { faceIdSupported, hashPin, verifyFaceId } from "@/lib/lock";
import { useData } from "@/lib/store";
import { Button } from "./ui";

/** Tela de entrada: Face ID quando cadastrado, PIN sempre como reserva. */
export default function Lock({ onOpen }: { onOpen: () => void }) {
  const { lock } = useData().config;
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState("");
  const [tentando, setTentando] = useState(false);

  async function faceId() {
    if (!lock.credId || !faceIdSupported()) return;
    setTentando(true);
    const ok = await verifyFaceId(lock.credId);
    setTentando(false);
    if (ok) onOpen();
    else setErro("Face ID não reconheceu. Use o PIN.");
  }

  // Pede o Face ID assim que abre, se estiver cadastrado.
  useEffect(() => {
    if (lock.credId) faceId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tentarPin(value: string) {
    setPin(value);
    setErro("");
    if (value.length < 4) return;
    if ((await hashPin(value)) === lock.pinHash) onOpen();
    else if (value.length >= 6) {
      setErro("PIN errado.");
      setPin("");
    }
  }

  return (
    <div className="fixed inset-0 z-[70] hero flex flex-col items-center justify-center px-8 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH || ""}/icon-192.png`} alt="" className="w-20 h-20 rounded-[22px] shadow-lg" />
      <h1 className="text-[26px] font-extrabold mt-2">Rumo</h1>
      <p className="text-white/70 mt-1 mb-8">Seus dados estão trancados.</p>

      <label className="w-full max-w-[280px]">
        <span className="block text-white/70 text-[13px] mb-1">PIN</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => tentarPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
          className="num text-center text-[26px] tracking-[0.4em] !bg-white/15 !text-white"
          placeholder="••••••"
        />
      </label>
      {erro && <p className="text-[13px] mt-2" style={{ color: "#ffbfb5" }}>{erro}</p>}

      {lock.credId && faceIdSupported() && (
        <Button className="mt-6 !bg-white/15 !text-white" disabled={tentando} onClick={faceId}>
          {tentando ? "Aguardando…" : "Entrar com Face ID"}
        </Button>
      )}
      {!lock.credId && (
        <p className="text-white/60 text-[13px] mt-6 max-w-[280px]">
          Dá para ligar o Face ID depois, em Mais › Segurança.
        </p>
      )}
    </div>
  );
}
