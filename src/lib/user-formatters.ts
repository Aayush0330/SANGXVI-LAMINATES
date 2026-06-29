const NAME_ACRONYMS = new Set([
  "ai",
  "api",
  "ceo",
  "cfo",
  "cto",
  "erp",
  "hr",
  "ios",
  "it",
  "qc",
  "sms",
]);

function capitalizeWord(word: string) {
  const lowerWord = word.toLowerCase();

  if (NAME_ACRONYMS.has(lowerWord)) {
    return lowerWord.toUpperCase();
  }

  return lowerWord.charAt(0).toUpperCase() + lowerWord.slice(1);
}

function capitalizeNamePart(part: string) {
  return part
    .split("-")
    .map((hyphenPart) =>
      hyphenPart
        .split("'")
        .map((apostrophePart) =>
          apostrophePart ? capitalizeWord(apostrophePart) : apostrophePart
        )
        .join("'")
    )
    .join("-");
}

export function formatPersonName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part) => capitalizeNamePart(part))
    .join(" ");
}

export function formatIndianPhoneNumber(phone?: string | null) {
  if (!phone) {
    return null;
  }

  const digits = phone.replace(/\D/g, "");

  if (!digits) {
    return null;
  }

  let nationalNumber = digits;

  if (digits.length === 12 && digits.startsWith("91")) {
    nationalNumber = digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    nationalNumber = digits.slice(1);
  }

  if (nationalNumber.length === 10) {
    return `+91 ${nationalNumber.slice(0, 5)} ${nationalNumber.slice(5)}`;
  }

  return `+91 ${nationalNumber}`;
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
