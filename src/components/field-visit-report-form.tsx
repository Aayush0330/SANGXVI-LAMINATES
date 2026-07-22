"use client";

import { useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

type FieldVisitReportFormProps = {
  action: (formData: FormData) => Promise<void>;
};

const maxPhotos = 5;
const maxPhotoSizeBytes = 3 * 1024 * 1024;
const maxTotalPhotoSizeBytes = maxPhotos * maxPhotoSizeBytes;

const inputClass =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-500/70 focus:ring-2 focus:ring-emerald-300/20";

const labelClass =
  "text-[11px] font-black uppercase tracking-[0.24em] text-slate-500";

const selectStyle = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundPosition: "right 1rem center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "18px 18px",
} as const;

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-2xl bg-emerald-300 px-5 py-4 text-sm font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving Visit..." : "Save Field Visit"}
    </button>
  );
}

export function FieldVisitReportForm({ action }: FieldVisitReportFormProps) {
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [accuracy, setAccuracy] = useState("");
  const [selectedPhotos, setSelectedPhotos] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [locationStatus, setLocationStatus] = useState(
    "Capture live GPS before saving the visit report."
  );
  const [isCapturingLocation, setIsCapturingLocation] = useState(false);

  const locationReady = useMemo(
    () => Boolean(latitude && longitude),
    [latitude, longitude]
  );

  function syncPhotoInput(files: File[]) {
    const input = photoInputRef.current;
    if (!input) {
      return;
    }

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }

  function addPhotos(incomingFiles: File[]) {
    const uniquePhotos = [...selectedPhotos];
    const existingKeys = new Set(
      selectedPhotos.map(
        (file) => `${file.name}:${file.size}:${file.lastModified}`
      )
    );

    incomingFiles.forEach((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        uniquePhotos.push(file);
      }
    });

    let error = "";
    if (uniquePhotos.length > maxPhotos) {
      error = `You can upload a maximum of ${maxPhotos} photos.`;
    } else if (uniquePhotos.some((file) => file.size > maxPhotoSizeBytes)) {
      error = "Each photo must be 3 MB or smaller.";
    } else if (
      uniquePhotos.reduce((total, file) => total + file.size, 0) >
      maxTotalPhotoSizeBytes
    ) {
      error = "The combined photos must be 15 MB or smaller.";
    }

    if (error) {
      setPhotoError(error);
      syncPhotoInput(selectedPhotos);
      return;
    }

    setPhotoError("");
    setSelectedPhotos(uniquePhotos);

    const input = photoInputRef.current;
    if (input) {
      input.setCustomValidity("");
    }
    syncPhotoInput(uniquePhotos);
  }

  function removePhoto(indexToRemove: number) {
    const remainingPhotos = selectedPhotos.filter(
      (_, index) => index !== indexToRemove
    );
    setSelectedPhotos(remainingPhotos);
    setPhotoError("");
    syncPhotoInput(remainingPhotos);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("GPS is not supported in this browser or device.");
      return;
    }

    setIsCapturingLocation(true);
    setLocationStatus("Capturing live GPS location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
        setAccuracy(String(position.coords.accuracy));
        setLocationStatus(
          `Location captured. Accuracy is approximately ${Math.round(
            position.coords.accuracy
          )} metres.`
        );
        setIsCapturingLocation(false);
      },
      (error) => {
        setLocationStatus(
          error.message ||
            "Location permission was denied. Allow location access and try again."
        );
        setIsCapturingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      }
    );
  }

  return (
    <form
      action={action}
      className="grid gap-5 rounded-2xl border border-emerald-200 bg-emerald-300/[0.04] p-5 shadow-sm shadow-slate-200/70 sm:p-6"
    >
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />
      <input type="hidden" name="accuracyMeters" value={accuracy} />

      <div>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">
          Field Visit Report
        </p>
        <h2 className="mt-2 text-2xl font-black text-slate-950">
          Upload visit proof
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Add shop details, live location, up to five current photos,
          discussion notes, achieved goals, and pending goals.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="shopName" className={labelClass}>
            Shop / Customer Name
          </label>
          <input
            id="shopName"
            name="shopName"
            placeholder="Shop / dealer name"
            className={`${inputClass} mt-2`}
            required
          />
        </div>

        <div>
          <label htmlFor="dealerName" className={labelClass}>
            Dealer / Company
          </label>
          <input
            id="dealerName"
            name="dealerName"
            placeholder="Dealer or company name"
            className={`${inputClass} mt-2`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <label htmlFor="visitType" className={labelClass}>
            Visit Type
          </label>
          <select
            id="visitType"
            name="visitType"
            className={`${inputClass} mt-2 appearance-none pr-12`}
            style={selectStyle}
            defaultValue="DEALER_VISIT"
          >
            <option value="DEALER_VISIT">Dealer Visit</option>
            <option value="NEW_DEALER_PROSPECT">New Dealer Prospect</option>
            <option value="FOLLOW_UP">Follow Up</option>
            <option value="COLLECTION_SUPPORT">Collection Support</option>
            <option value="MARKET_SURVEY">Market Survey</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div>
          <label htmlFor="contactPerson" className={labelClass}>
            Contact Person
          </label>
          <input
            id="contactPerson"
            name="contactPerson"
            placeholder="Person met"
            className={`${inputClass} mt-2`}
          />
        </div>

        <div>
          <label htmlFor="contactPhone" className={labelClass}>
            Contact Phone
          </label>
          <input
            id="contactPhone"
            name="contactPhone"
            type="tel"
            inputMode="tel"
            placeholder="Mobile number"
            className={`${inputClass} mt-2`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="visitPhotos" className={labelClass}>
            Visit Photos
          </label>
          <input
            ref={photoInputRef}
            id="visitPhotos"
            name="visitPhotos"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className={`${inputClass} mt-2 file:mr-4 file:rounded-xl file:border-0 file:bg-emerald-300 file:px-4 file:py-2 file:text-sm file:font-black file:text-slate-950`}
            required
            onChange={(event) => {
              addPhotos(Array.from(event.currentTarget.files ?? []));
            }}
          />
          <p className="mt-2 text-xs leading-5 text-slate-500">
            Upload 1–{maxPhotos} current JPG, PNG, or WebP images. Maximum 3 MB
            per photo. You can choose several together or add them one at a
            time.
          </p>

          {photoError ? (
            <p className="mt-2 text-xs font-bold text-rose-700" role="alert">
              {photoError}
            </p>
          ) : null}

          {selectedPhotos.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
                Selected {selectedPhotos.length} photo
                {selectedPhotos.length === 1 ? "" : "s"}
              </p>
              <div className="mt-2 grid gap-2">
                {selectedPhotos.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
                  >
                    <span className="min-w-0 truncate text-xs font-bold text-emerald-700">
                      {index + 1}. {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removePhoto(index)}
                      className="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-rose-700 transition hover:bg-rose-50"
                      aria-label={`Remove ${file.name}`}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div>
          <span className={labelClass}>Live GPS Location</span>
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm leading-6 text-slate-600">{locationStatus}</p>
            {locationReady ? (
              <p className="mt-2 text-xs text-emerald-700">
                Lat {Number(latitude).toFixed(6)}, Lng{" "}
                {Number(longitude).toFixed(6)}
              </p>
            ) : null}
            <button
              type="button"
              onClick={captureLocation}
              disabled={isCapturingLocation}
              className="mt-4 w-full rounded-2xl border border-emerald-300/40 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700 transition hover:bg-emerald-300/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCapturingLocation
                ? "Capturing GPS..."
                : "Capture Live Location"}
            </button>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="description" className={labelClass}>
          Visit Description
        </label>
        <textarea
          id="description"
          name="description"
          placeholder="What was done during the visit?"
          className={`${inputClass} mt-2 min-h-28`}
          required
        />
      </div>

      <div>
        <label htmlFor="pointsDiscussed" className={labelClass}>
          Points Discussed
        </label>
        <textarea
          id="pointsDiscussed"
          name="pointsDiscussed"
          placeholder="Product demand, objections, feedback, etc."
          className={`${inputClass} mt-2 min-h-24`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="goalsAchieved" className={labelClass}>
            Goals Achieved
          </label>
          <textarea
            id="goalsAchieved"
            name="goalsAchieved"
            placeholder="Order discussion completed, product shown, payment followed up..."
            className={`${inputClass} mt-2 min-h-24`}
          />
        </div>

        <div>
          <label htmlFor="goalsPending" className={labelClass}>
            Goals Pending
          </label>
          <textarea
            id="goalsPending"
            name="goalsPending"
            placeholder="Price approval pending, owner unavailable, next meeting required..."
            className={`${inputClass} mt-2 min-h-24`}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label htmlFor="status" className={labelClass}>
            Visit Result
          </label>
          <select
            id="status"
            name="status"
            className={`${inputClass} mt-2 appearance-none pr-12`}
            style={selectStyle}
            defaultValue="VISIT_REPORTED"
          >
            <option value="VISIT_REPORTED">Visit Reported</option>
            <option value="GOAL_ACHIEVED">Goal Achieved</option>
            <option value="GOAL_PENDING">Goal Pending</option>
            <option value="FOLLOW_UP_REQUIRED">Follow Up Required</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        <div>
          <label htmlFor="nextFollowUpAt" className={labelClass}>
            Next Follow-up
          </label>
          <input
            id="nextFollowUpAt"
            name="nextFollowUpAt"
            type="datetime-local"
            className={`${inputClass} mt-2`}
            style={{ colorScheme: "dark" }}
          />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
