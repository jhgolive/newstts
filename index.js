import express from "express";
import cors from "cors";
import xml2js from "xml2js";
import fetch from "node-fetch";
import path from "path";
import fs from "fs";
import textToSpeech from "@google-cloud/text-to-speech";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.static("."));

// Google Cloud 인증
if (process.env.GOOGLE_CREDENTIALS) {
  fs.writeFileSync("/tmp/google-credentials.json", process.env.GOOGLE_CREDENTIALS);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/google-credentials.json";
}

const ttsClient = new textToSpeech.TextToSpeechClient();

let lastNews = "뉴스 로딩 중...";
const parser = new xml2js.Parser({ explicitArray: false });

// 제외할 카테고리 ID
const EXCLUDE_CATEGORIES = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", // 헤드라인
  "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFp4WkRNU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko", //대한민국
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //세계
  "https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvTkwyY3ZNVEZpWXpaM2FHNHhiaElDYTI4b0FBUAE?hl=ko&gl=KR&ceid=KR:ko", //지역/서울
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //비즈니스
  "https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSnJieG9DUzFJb0FBUAE?hl=ko&gl=KR&ceid=KR:ko", //과학/기술
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //엔터테인먼트
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //스포츠
  "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko" //건강
];

// 가져올 카테고리 RSS URL (IT/과학, 스포츠 제외)
const CATEGORY_RSS = [
  "https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko", // 헤드라인
  "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNRFp4WkRNU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko", //대한민국
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //세계
  "https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvTkwyY3ZNVEZpWXpaM2FHNHhiaElDYTI4b0FBUAE?hl=ko&gl=KR&ceid=KR:ko", //지역/서울
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //비즈니스
  "https://news.google.com/rss/topics/CAAqKAgKIiJDQkFTRXdvSkwyMHZNR1ptZHpWbUVnSnJieG9DUzFJb0FBUAE?hl=ko&gl=KR&ceid=KR:ko", //과학/기술
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNREpxYW5RU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //엔터테인먼트
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtdHZHZ0pMVWlnQVAB?hl=ko&gl=KR&ceid=KR:ko", //스포츠
  "https://news.google.com/rss/topics/CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtdHZLQUFQAQ?hl=ko&gl=KR&ceid=KR:ko" //건강
];

// RSS fetch
async function fetchRSS(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
    const xml = await res.text();
    const result = await parser.parseStringPromise(xml);
    const items = Array.isArray(result.rss.channel.item)
      ? result.rss.channel.item
      : [result.rss.channel.item];
    return items;
  } catch (err) {
    console.error("RSS fetch/parse 실패:", url, err);
    return [];
  }
}

// 전체 뉴스
async function fetchAllNews() {
  try {
    const promises = CATEGORY_RSS.map(url => fetchRSS(url));
    const results = await Promise.all(promises);
    const allItems = results.flat();
    lastNews = allItems.map(i => i.title).join("   |   ");
    console.log(`✅ 총 뉴스 ${allItems.length}개 가져옴`);
  } catch (err) {
    console.error("전체 뉴스 가져오기 실패", err);
    lastNews = "뉴스 로딩 실패 😢";
  }
}

// 초기 + 24시간 마다 갱신
fetchAllNews();
//setInterval(fetchAllNews, 3600000); // 60분
setInterval(fetchAllNews, 86400000); // 24시간

// 텍스트를 4500바이트 이하로 분할
function splitTextForTTS(text, maxBytes = 4500) {
  const parts = [];
  let current = "";
  for (const word of text.split(" ")) {
    if (Buffer.byteLength(current + " " + word, "utf-8") > maxBytes) {
      parts.push(current);
      current = word;
    } else {
      current += (current ? " " : "") + word;
    }
  }
  if (current) parts.push(current);
  return parts;
}

// 뉴스 JSON
app.get("/news", (req, res) => {
  res.json({ news: lastNews });
});

// Google TTS (병렬 처리 + 합치기)
app.get("/news-tts", async (req, res) => {
  try {
    const chunks = splitTextForTTS(lastNews);

    // 병렬 TTS 요청
    const buffers = await Promise.all(chunks.map(async (chunk) => {
      const [response] = await ttsClient.synthesizeSpeech({
        input: { text: chunk },
        voice: { languageCode: "ko-KR", name: "ko-KR-Standard-A", ssmlGender: "FEMALE" },
        audioConfig: { audioEncoding: "MP3" },
      });
      return response.audioContent;
    }));

    const merged = Buffer.concat(buffers);
    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": merged.length,
    });
    res.send(merged);

  } catch (err) {
    console.error("TTS 생성 실패", err);
    res.status(500).send("TTS 생성 실패 😢");
  }
});

// 루트
app.get("/", (req, res) => 
  res.sendFile(path.join(process.cwd(), "index.html"))
);

app.listen(PORT, () => 
  console.log(`✅ Server running on port ${PORT}`)
);
