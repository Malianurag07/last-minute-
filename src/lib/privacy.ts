/**
 * Privacy notice shown before sign-up (DPDP Act 2023, s.5) in plain language,
 * English + Hindi. Keep in sync with the server's /v1/privacy/notice.
 */
export const NOTICE_VERSION = '2026-11-01';

export const GRIEVANCE_OFFICER = {
  name: 'Grievance Officer, LastMinute',
  email: 'grievance@lastminute.example',
  phone: '+91-1800-000-0000',
};

export const NOTICE = {
  en: {
    title: 'How we use your information',
    collect: 'We collect: your name, mobile number, pickup/drop address (only if you use delivery), order details, and reviews you write.',
    why: [
      'To create and protect your account (needed).',
      'To share your name, number and address with the provider and delivery partner for the order you place (needed for the service).',
      'To send offers and tips by SMS/WhatsApp — only if you say yes. You can stop anytime.',
    ],
    keep: 'We delete your details when you delete your account. Order bills are kept for 8 years without your name or number, because tax law requires it.',
    rights: 'You can see, correct or delete your data, withdraw consent, name a nominee, and complain to our Grievance Officer or the Data Protection Board of India.',
    age: 'LastMinute is only for people aged 18 or older.',
  },
  hi: {
    title: 'हम आपकी जानकारी कैसे इस्तेमाल करते हैं',
    collect: 'हम लेते हैं: आपका नाम, मोबाइल नंबर, पता (सिर्फ़ डिलीवरी के लिए), ऑर्डर की जानकारी और आपके रिव्यू।',
    why: [
      'आपका खाता बनाने और सुरक्षित रखने के लिए (ज़रूरी)।',
      'आपके ऑर्डर के लिए आपका नाम, नंबर और पता सेवा देने वाले और डिलीवरी पार्टनर को देने के लिए (ज़रूरी)।',
      'ऑफ़र और जानकारी SMS/WhatsApp पर — सिर्फ़ अगर आप हाँ कहें। कभी भी बंद कर सकते हैं।',
    ],
    keep: 'खाता हटाने पर आपकी जानकारी मिटा दी जाती है। टैक्स कानून के कारण बिल 8 साल तक बिना नाम-नंबर के रखे जाते हैं।',
    rights: 'आप अपनी जानकारी देख, सुधार या मिटा सकते हैं, सहमति वापस ले सकते हैं, नॉमिनी चुन सकते हैं, और शिकायत अधिकारी या डेटा प्रोटेक्शन बोर्ड से शिकायत कर सकते हैं।',
    age: 'LastMinute सिर्फ़ 18 साल या उससे ज़्यादा उम्र के लोगों के लिए है।',
  },
};
