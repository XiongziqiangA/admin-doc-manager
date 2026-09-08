export interface SystemCategorySeed {
  name: string;
  code: string;
  sort: number;
}

export const SYSTEM_CATEGORIES: SystemCategorySeed[] = [
  { name: "\u884c\u653f\u5236\u5ea6", code: "XZ", sort: 10 },
  { name: "\u5408\u540c\u6587\u4ef6", code: "HT", sort: 20 },
  { name: "\u8d44\u8d28\u8bc1\u7167", code: "ZZ", sort: 30 },
  { name: "\u4eba\u4e8b\u8d44\u6599", code: "RS", sort: 40 },
  { name: "\u8d22\u52a1\u7968\u636e", code: "CW", sort: 50 },
  { name: "\u5ba2\u6237\u8d44\u6599", code: "KH", sort: 60 },
  { name: "\u4f9b\u5e94\u5546\u8d44\u6599", code: "GYS", sort: 70 },
  { name: "\u8d44\u4ea7\u8bbe\u5907", code: "ZC", sort: 80 },
  { name: "\u529e\u516c\u573a\u5730", code: "BG", sort: 90 },
  { name: "\u5176\u4ed6\u8d44\u6599", code: "QT", sort: 100 },
];
