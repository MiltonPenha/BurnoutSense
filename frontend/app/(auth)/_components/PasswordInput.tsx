"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentPropsWithoutRef } from "react";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & { id: string; fieldName?: string };

export function PasswordInput({ id, fieldName = "senha", ...input }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const action = `${visible ? "Ocultar" : "Mostrar"} ${fieldName}`;
  const Icon = visible ? EyeOff : Eye;

  return <div className="password-field">
    <input {...input} id={id} className="input" type={visible ? "text" : "password"} />
    <button className="password-toggle" type="button" aria-label={action} aria-controls={id} title={action} onClick={() => setVisible(value => !value)}>
      <Icon size={18} aria-hidden="true" />
    </button>
  </div>;
}
