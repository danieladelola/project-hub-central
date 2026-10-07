import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";

type Values = { email: string; password: string; fullName: string };
type Field = { name: string; label: string; type: string; autoComplete?: string };

export function AuthForm({ fields, submitLabel, onSubmit }: {
  fields: Field[];
  submitLabel: string;
  onSubmit: (values: Values) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const values = Object.fromEntries(new FormData(e.currentTarget)) as Values;
    try {
      setError(await onSubmit(values));
    } catch {
      setError("Please check your details and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      {fields.map((f) => (
        <div key={f.name} className="space-y-2">
          <Label htmlFor={f.name}>{f.label}</Label>
          {f.type === "password" ? (
            <PasswordInput id={f.name} name={f.name} autoComplete={f.autoComplete} required />
          ) : (
            <Input id={f.name} name={f.name} type={f.type} autoComplete={f.autoComplete} required className="h-11" />
          )}
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={loading}>
        {loading ? "Please wait…" : submitLabel}
      </Button>
    </form>
  );
}
