export type SupportedLanguage = 'en' | 'bn';

export const NAGAD_PERSONAL_NUMBER = '+8801822332020';
export const NAGAD_ACCOUNT_TYPE_EN = 'Personal';
export const NAGAD_ACCOUNT_TYPE_BN = 'পার্সোনাল (Personal)';

export const NAGAD_DEFAULT_ADMIN_INSTRUCTIONS = `Open your Nagad app -> Select Send Money -> Send the exact payable amount to ${NAGAD_PERSONAL_NUMBER} (${NAGAD_ACCOUNT_TYPE_EN}) -> Enter your Nagad Transaction ID (TrxID) and sender number below for manual verification.`;

export function getNagadManualSteps(
  lang: SupportedLanguage,
  formattedAmount: string,
  recipientNumber: string = NAGAD_PERSONAL_NUMBER
): string[] {
  const cleanRecipient = recipientNumber.trim() || NAGAD_PERSONAL_NUMBER;
  if (lang === 'bn') {
    return [
      'আপনার Nagad অ্যাপ খুলুন।',
      'Send Money অপশন নির্বাচন করুন।',
      `প্রদর্শিত নির্দিষ্ট পরিমাণ (${formattedAmount}) ${cleanRecipient} নম্বরে পাঠান।`,
      'নিচে আপনার Nagad Transaction ID (TrxID) এবং প্রেরকের নম্বর লিখুন।',
      'ম্যানুয়াল যাচাইকরণের (Manual verification) জন্য পেমেন্ট সাবমিট করুন।',
    ];
  }
  return [
    'Open your Nagad app.',
    'Select Send Money.',
    `Send the exact displayed payment amount (${formattedAmount}) to ${cleanRecipient}.`,
    'Enter your Nagad Transaction ID (TrxID) and sender phone number below.',
    'Submit your payment for manual verification.',
  ];
}
