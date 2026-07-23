import type { SecondPersonInput } from "@/lib/horoscope/types";

export const emptySecondPerson: SecondPersonInput = {
  fullName: "",
  dateOfBirth: "",
  birthTime: "",
  birthTimeKnown: true,
  birthPlace: "",
};

export default function SecondPersonFields({
  value,
  onChange,
  idPrefix = "birth-person",
}: {
  value: SecondPersonInput;
  onChange: (value: SecondPersonInput) => void;
  idPrefix?: string;
}) {
  const field =
    "mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#020817]/70 px-3 text-white outline-none transition placeholder:text-white/25 focus:border-sky-400/60 focus:ring-2 focus:ring-sky-400/10 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label htmlFor={`${idPrefix}-name`} className="text-sm text-white/60">
        Full name
        <input
          id={`${idPrefix}-name`}
          required
          maxLength={100}
          autoComplete="name"
          placeholder="Enter full name"
          className={field}
          value={value.fullName}
          onChange={(event) =>
            onChange({ ...value, fullName: event.target.value })
          }
        />
      </label>

      <label htmlFor={`${idPrefix}-date`} className="text-sm text-white/60">
        Date of birth
        <input
          id={`${idPrefix}-date`}
          required
          type="date"
          max={new Date().toISOString().slice(0, 10)}
          className={field}
          value={value.dateOfBirth}
          onChange={(event) =>
            onChange({ ...value, dateOfBirth: event.target.value })
          }
        />
      </label>

      <label htmlFor={`${idPrefix}-time`} className="text-sm text-white/60">
        Birth time
        <input
          id={`${idPrefix}-time`}
          required={value.birthTimeKnown}
          disabled={!value.birthTimeKnown}
          type="time"
          className={field}
          value={value.birthTime}
          onChange={(event) =>
            onChange({ ...value, birthTime: event.target.value })
          }
        />
      </label>

      <label htmlFor={`${idPrefix}-place`} className="text-sm text-white/60">
        Birth place
        <input
          id={`${idPrefix}-place`}
          required
          maxLength={160}
          placeholder="City, state, country"
          className={field}
          value={value.birthPlace}
          onChange={(event) =>
            onChange({ ...value, birthPlace: event.target.value })
          }
        />
      </label>

      <label
        htmlFor={`${idPrefix}-unknown-time`}
        className="flex min-h-10 items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3 text-sm text-white/60 sm:col-span-2"
      >
        <input
          id={`${idPrefix}-unknown-time`}
          type="checkbox"
          className="h-4 w-4 accent-sky-400"
          checked={!value.birthTimeKnown}
          onChange={(event) =>
            onChange({
              ...value,
              birthTimeKnown: !event.target.checked,
              birthTime: event.target.checked ? "" : value.birthTime,
            })
          }
        />
        I don&apos;t know the exact birth time
      </label>
    </div>
  );
}
