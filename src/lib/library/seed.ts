/**
 * The starting taxonomy, the master book list and the verified course list.
 *
 * Two rules govern this file.
 *
 * Nothing is invented. Course URLs were checked against the institution's own
 * site; where a lesson count, a duration or a page count wasn't on the official
 * page, the field is absent rather than guessed. An invented "24 lessons" looks
 * exactly like a real one, and you'd plan against it.
 *
 * No book carries an external link. The app hosts nothing and sells nothing —
 * a fabricated shop URL would be worse than no URL, and a real one would be an
 * editorial endorsement of a seller. Add your own when you buy a copy.
 *
 * Pure data; the seeding itself lives in src/actions.
 */

import {
  EDITORIAL_ORDER,
  BOOK_DESCRIPTIONS,
  BOOK_WHY_LEARN,
  HANDOFF_CATEGORIES,
} from "./editorial";

export interface SeedCategory {
  slug: string;
  name: string;
  description?: string;
  subtags: { slug: string; name: string }[];
}

/**
 * One tree for every medium.
 *
 * Philosophy holds a book, a YouTube video, a podcast episode and a Yale
 * lecture course side by side. Four parallel taxonomies would have made
 * "everything I have on free will" a four-way union query and a four-way
 * maintenance job.
 *
 * The same subtag slug may appear under two categories — "Free Will" sits under
 * both Theology and Philosophy, "Prophecy" under both Theology and Literature —
 * because they genuinely are different tags that share a name. Uniqueness is
 * per category, which is why every reference below is written `category/subtag`
 * rather than a bare slug that would be ambiguous.
 */
export const SEED_CATEGORIES: SeedCategory[] = [
  {
    slug: "theology",
    name: "Theology",
    description: "God, faith, and what follows from them.",
    subtags: [
      { slug: "christianity", name: "Christianity" },
      { slug: "revelation", name: "Revelation" },
      { slug: "faith-and-reason", name: "Faith and Reason" },
      { slug: "existence-of-god", name: "Existence of God" },
      { slug: "problem-of-evil", name: "Problem of Evil" },
      { slug: "sin", name: "Sin" },
      { slug: "redemption", name: "Redemption" },
      { slug: "salvation", name: "Salvation" },
      { slug: "free-will", name: "Free Will" },
      { slug: "prayer", name: "Prayer" },
      { slug: "prophecy", name: "Prophecy" },
    ],
  },
  {
    slug: "philosophy",
    name: "Philosophy",
    description: "How to think about living, knowing and acting.",
    subtags: [
      { slug: "ethics", name: "Ethics" },
      { slug: "morality", name: "Morality" },
      { slug: "meaning-of-life", name: "Meaning of Life" },
      { slug: "free-will", name: "Free Will" },
      { slug: "human-nature", name: "Human Nature" },
      { slug: "good-and-evil", name: "Good and Evil" },
      { slug: "stoicism", name: "Stoicism" },
      { slug: "existentialism", name: "Existentialism" },
      { slug: "political-philosophy", name: "Political Philosophy" },
      { slug: "metaphysics", name: "Metaphysics" },
      { slug: "mortality", name: "Mortality" },
      { slug: "critical-thinking", name: "Critical Thinking" },
    ],
  },
  {
    slug: "psychology",
    name: "Psychology",
    description: "Why people do what they do.",
    subtags: [
      { slug: "cognition", name: "Cognition" },
      { slug: "behaviour", name: "Behaviour" },
      { slug: "biology-of-behaviour", name: "Biology of Behaviour" },
      { slug: "decision-making", name: "Decision Making" },
      { slug: "moral-psychology", name: "Moral Psychology" },
    ],
  },
  {
    slug: "personal-development",
    name: "Personal Development",
    description: "Character, habits and how to carry difficulty.",
    subtags: [
      { slug: "wisdom", name: "Wisdom" },
      { slug: "discipline", name: "Discipline" },
      { slug: "purpose", name: "Purpose" },
      { slug: "relationships", name: "Relationships" },
      { slug: "suffering", name: "Suffering" },
      { slug: "hope", name: "Hope" },
      { slug: "character", name: "Character" },
      { slug: "habits", name: "Habits" },
      { slug: "focus", name: "Focus" },
    ],
  },
  {
    slug: "literature",
    name: "Literature",
    description: "Writing that argues about how to live.",
    subtags: [
      { slug: "wisdom-literature", name: "Wisdom Literature" },
      { slug: "poetry", name: "Poetry" },
      { slug: "historical-narrative", name: "Historical Narrative" },
      { slug: "prophecy", name: "Prophecy" },
      { slug: "parables", name: "Parables" },
      { slug: "apocalyptic-literature", name: "Apocalyptic Literature" },
      { slug: "classic", name: "Classic" },
      { slug: "russian-literature", name: "Russian Literature" },
      { slug: "novels", name: "Novels" },
      { slug: "essays", name: "Essays" },
      { slug: "dystopia", name: "Dystopia" },
    ],
  },
  {
    slug: "history",
    name: "History",
    description: "What happened, and the context that makes it legible.",
    subtags: [
      { slug: "ancient-israel", name: "Ancient Israel" },
      { slug: "early-christianity", name: "Early Christianity" },
      { slug: "ancient-world", name: "Ancient World" },
      { slug: "religious-history", name: "Religious History" },
      { slug: "historical-context", name: "Historical Context" },
      { slug: "intellectual-history", name: "Intellectual History" },
      { slug: "modern-history", name: "Modern History" },
    ],
  },
  {
    slug: "politics",
    name: "Politics",
    description: "Power, liberty and how societies are governed.",
    subtags: [
      { slug: "political-philosophy", name: "Political Philosophy" },
      { slug: "liberty", name: "Liberty" },
      { slug: "totalitarianism", name: "Totalitarianism" },
      { slug: "democracy", name: "Democracy" },
      { slug: "power", name: "Power" },
    ],
  },
  {
    slug: "economics",
    name: "Economics",
    description: "How resources move, and why markets behave as they do.",
    subtags: [
      { slug: "markets", name: "Markets" },
      { slug: "growth", name: "Growth" },
      { slug: "institutions", name: "Institutions" },
      { slug: "behavioural-economics", name: "Behavioural Economics" },
    ],
  },
  {
    slug: "finance",
    name: "Finance",
    description: "Money, risk and the history of both.",
    subtags: [
      { slug: "personal-finance", name: "Personal Finance" },
      { slug: "risk", name: "Risk" },
      { slug: "behavioural-finance", name: "Behavioural Finance" },
      { slug: "financial-history", name: "Financial History" },
    ],
  },
  {
    slug: "investments",
    name: "Investments",
    description: "Putting capital to work without fooling yourself.",
    subtags: [
      { slug: "index-investing", name: "Index Investing" },
      { slug: "value-investing", name: "Value Investing" },
      { slug: "portfolio-construction", name: "Portfolio Construction" },
      { slug: "market-efficiency", name: "Market Efficiency" },
    ],
  },
  {
    slug: "business",
    name: "Business",
    description: "Building something that works and keeps working.",
    subtags: [
      { slug: "strategy", name: "Strategy" },
      { slug: "entrepreneurship", name: "Entrepreneurship" },
      { slug: "marketing", name: "Marketing" },
      { slug: "management", name: "Management" },
      { slug: "startups", name: "Startups" },
    ],
  },
  {
    slug: "communication",
    name: "Communication",
    description: "Being understood, and understanding what you're told.",
    subtags: [
      { slug: "persuasion", name: "Persuasion" },
      { slug: "negotiation", name: "Negotiation" },
      { slug: "relationships", name: "Relationships" },
    ],
  },
  {
    slug: "technology",
    name: "Technology",
    description: "What the machines do and who controls them.",
    subtags: [
      { slug: "computing", name: "Computing" },
      { slug: "semiconductors", name: "Semiconductors" },
      { slug: "programming", name: "Programming" },
      { slug: "attention", name: "Attention" },
    ],
  },
  {
    slug: "science",
    name: "Science",
    description: "How to find out, and how to avoid fooling yourself.",
    subtags: [
      { slug: "scientific-method", name: "Scientific Method" },
      { slug: "skepticism", name: "Skepticism" },
      { slug: "probability", name: "Probability" },
    ],
  },
  {
    slug: "mathematics",
    name: "Mathematics",
    description: "The tools underneath everything quantitative.",
    subtags: [
      { slug: "probability", name: "Probability" },
      { slug: "statistics", name: "Statistics" },
      { slug: "inference", name: "Inference" },
    ],
  },
  {
    slug: "geopolitics",
    name: "Geopolitics",
    description: "Maps, chokepoints and the constraints they impose.",
    subtags: [
      { slug: "geography", name: "Geography" },
      { slug: "power", name: "Power" },
      { slug: "supply-chains", name: "Supply Chains" },
    ],
  },
  {
    slug: "society",
    name: "Society",
    description: "Culture and the institutions people live inside.",
    subtags: [
      { slug: "culture", name: "Culture" },
      { slug: "institutions", name: "Institutions" },
      { slug: "modernity", name: "Modernity" },
    ],
  },
];

export interface SeedResource {
  slug: string;
  type: "BOOK" | "VIDEO" | "PODCAST" | "COURSE";
  title: string;
  creator: string;
  description: string;
  whyLearn?: string;
  /** Newline-separated; rendered as a list. */
  lessons?: string;
  /** Absent for books: the app neither hosts media nor recommends a seller. */
  externalUrl?: string;
  level: "EVERYONE" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  language?: string;
  progressUnit: "PAGES" | "MINUTES" | "LESSONS" | "PERCENTAGE";
  categories: string[];
  /** Always `category/subtag` — a bare slug can belong to two categories. */
  subtags: string[];
  featured?: boolean;
  /** See src/lib/library/ranking.ts. Rank 1 belongs to exactly one resource. */
  editorialRank?: number;
  heroFeatured?: boolean;
  specialBadge?: string;
  specialDescription?: string;
  meta?: {
    platform?: string;
    institution?: string;
    instructor?: string;
    /** Official-channel playlist. Only ever set from a verified one. */
    videoUrl?: string;
    /** Videos in that playlist, counted on the channel — never estimated. */
    lessonCount?: number;
  };
}

/**
 * Where each course can be watched, verified one playlist at a time.
 *
 * Checked in August 2026 by opening each playlist and reading the channel that
 * owns it. YouTube is full of complete re-uploads of these courses under names
 * that look official — the search results for the two Yale religious studies
 * courses were *entirely* re-uploads, owned by private accounts. Those two are
 * absent here rather than linked, because a re-upload can be deleted, reordered
 * or quietly edited, and a link that used to be a lecture is worse than none.
 *
 * `lessons` is the playlist's video count, which is a fact about the playlist
 * rather than an estimate of the course. Some include a trailer.
 */
export interface CourseVideo {
  url: string;
  /** The channel that owns it — the thing that was actually verified. */
  channel: string;
  lessons: number;
}

export const COURSE_VIDEOS: Record<string, CourseVideo> = {
  "yale-financial-markets-shiller": {
    url: "https://www.youtube.com/playlist?list=PL8FB14A2200B87185",
    channel: "YaleCourses",
    lessons: 23,
  },
  "yale-introduction-political-philosophy": {
    url: "https://www.youtube.com/playlist?list=PL8D95DEA9B7DFE825",
    channel: "YaleCourses",
    lessons: 24,
  },
  "yale-philosophy-science-human-nature": {
    url: "https://www.youtube.com/playlist?list=PL3F6BC200B2930084",
    channel: "YaleCourses",
    lessons: 26,
  },
  "yale-death-kagan": {
    url: "https://www.youtube.com/playlist?list=PLEA18FAF1AD9047B0",
    channel: "YaleCourses",
    lessons: 26,
  },
  "yale-introduction-psychology-bloom": {
    url: "https://www.youtube.com/playlist?list=PL6A08EB4EEFF3E91F",
    channel: "YaleCourses",
    lessons: 20,
  },
  "stanford-human-behavioral-biology-sapolsky": {
    url: "https://www.youtube.com/playlist?list=PL848F2368C90DDC3D",
    channel: "Stanford",
    lessons: 25,
  },
  "harvard-justice-sandel": {
    url: "https://www.youtube.com/playlist?list=PL30C13C91CFFEFEA6",
    channel: "Harvard University",
    lessons: 19,
  },
  // Deliberately absent: the two Yale religious studies courses (no official
  // playlist found) and MIT 18.05, which is taught through notes and problem
  // sets rather than recorded lectures.
};

/**
 * The application's editorial position, in one place.
 *
 * Exported so the hero section, the seed and the tests all refer to the same
 * strings instead of three copies that drift apart. This is a claim the app
 * makes about a book; it is not, and must never become, a rating on the user's
 * behalf — `personalRating` stays empty and stays theirs.
 */
export const GREATEST_BOOK_BADGE = "#1 — The Greatest Book of All Time";
export const GREATEST_BOOK_SUBTITLE =
  "The foundational book of the Christian faith and the most influential work in human history.";

const BIBLE: SeedResource = {
  slug: "the-holy-bible",
  type: "BOOK",
  title: "The Holy Bible",
  creator: "Various Authors",
  // Not a difficulty rating. Some of it is plain narrative and some of it is
  // hard even for scholars, so a single "intermediate" would misdescribe both
  // halves and turn a first reader away from the parts that are open to them.
  level: "EVERYONE",
  // Editions differ in canon, translation and page count, so a page total would
  // be a property of one copy pretending to be a property of the book.
  progressUnit: "PERCENTAGE",
  featured: true,
  editorialRank: 1,
  heroFeatured: true,
  specialBadge: GREATEST_BOOK_BADGE,
  specialDescription: GREATEST_BOOK_SUBTITLE,
  description:
    "The Holy Bible is the central sacred text of Christianity and the most important book in this Library. Across its different books, it explores God, creation, human nature, morality, suffering, justice, love, sacrifice, redemption, salvation, and the meaning of life. Its influence extends across theology, philosophy, law, history, literature, art, politics, and Western civilization.",
  whyLearn:
    "The Bible does not address only one area of life. It presents a complete spiritual and moral vision of humanity, from creation and human failure to redemption and eternal hope. It has shaped civilizations, inspired countless works of philosophy and art, and transformed the lives of billions of people.",
  lessons: [
    "Faith and trust in God",
    "Love of God and one's neighbour",
    "Human dignity and moral responsibility",
    "Sin, forgiveness, and redemption",
    "Wisdom, discipline, and humility",
    "Justice, mercy, and sacrifice",
    "Suffering, hope, and perseverance",
    "Free will and the consequences of human choices",
    "The life, teachings, death, and resurrection of Jesus Christ",
    "Salvation and eternal life",
  ].join("\n"),
  categories: ["theology", "philosophy", "history", "literature", "personal-development"],
  subtags: [
    "theology/christianity",
    "theology/revelation",
    "theology/faith-and-reason",
    "theology/existence-of-god",
    "theology/problem-of-evil",
    "theology/sin",
    "theology/redemption",
    "theology/salvation",
    "theology/free-will",
    "theology/prayer",
    "theology/prophecy",
    "philosophy/ethics",
    "philosophy/morality",
    "philosophy/meaning-of-life",
    "philosophy/free-will",
    "philosophy/human-nature",
    "philosophy/good-and-evil",
    "history/ancient-israel",
    "history/early-christianity",
    "history/ancient-world",
    "history/religious-history",
    "history/historical-context",
    "literature/wisdom-literature",
    "literature/poetry",
    "literature/historical-narrative",
    "literature/prophecy",
    "literature/parables",
    "literature/apocalyptic-literature",
    "literature/classic",
    "personal-development/wisdom",
    "personal-development/discipline",
    "personal-development/purpose",
    "personal-development/relationships",
    "personal-development/suffering",
    "personal-development/hope",
    "personal-development/character",
  ],
};

/** Keeps fifty entries readable; every field is still explicit at the call. */
function book(
  slug: string,
  title: string,
  creator: string,
  level: SeedResource["level"],
  description: string,
  categories: string[],
  subtags: string[]
): SeedResource {
  return {
    slug,
    type: "BOOK",
    title,
    creator,
    level,
    description,
    // No page counts are known here, and PERCENTAGE works for any edition.
    progressUnit: "PERCENTAGE",
    categories,
    subtags,
  };
}

/**
 * The master list. The Bible is first and is the only entry with rank 1.
 *
 * Everything after it may be featured or recommended; none of it may take that
 * badge, which is enforced by a unique constraint on `editorial_rank` and
 * checked in the tests.
 */
const RAW_BOOKS: SeedResource[] = [
  BIBLE,

  // Christian theology and philosophy
  book(
    "mere-christianity",
    "Mere Christianity",
    "C. S. Lewis",
    "BEGINNER",
    "A case for the common ground of Christian belief, built up from an argument about moral law rather than from scripture.",
    ["theology", "philosophy"],
    ["theology/christianity", "theology/faith-and-reason", "philosophy/morality"]
  ),
  book(
    "confessions-augustine",
    "Confessions",
    "Augustine of Hippo",
    "INTERMEDIATE",
    "An autobiography addressed to God: desire, theft, grief, conversion, and a mind examining its own memory.",
    ["theology", "philosophy", "psychology", "literature"],
    ["theology/sin", "theology/redemption", "philosophy/human-nature", "literature/classic"]
  ),
  book(
    "introduction-to-christianity",
    "Introduction to Christianity",
    "Joseph Ratzinger",
    "ADVANCED",
    "A theologian's reading of the Apostles' Creed, line by line, for readers who want the reasoning rather than the summary.",
    ["theology", "philosophy"],
    ["theology/christianity", "theology/faith-and-reason", "theology/revelation"]
  ),
  book(
    "the-cost-of-discipleship",
    "The Cost of Discipleship",
    "Dietrich Bonhoeffer",
    "INTERMEDIATE",
    "On what following Christ demands in practice, written against a church that had made grace comfortable.",
    ["theology", "personal-development"],
    ["theology/christianity", "personal-development/discipline", "personal-development/character"]
  ),
  book(
    "the-orthodox-way",
    "The Orthodox Way",
    "Kallistos Ware",
    "INTERMEDIATE",
    "An introduction to Eastern Orthodox theology and prayer, written as a path to walk rather than a system to learn.",
    ["theology", "philosophy"],
    ["theology/christianity", "theology/prayer", "theology/revelation"]
  ),

  // Philosophy
  book(
    "meditations",
    "Meditations",
    "Marcus Aurelius",
    "BEGINNER",
    "The private notebooks of a Roman emperor, reminding himself how to behave — never written for publication.",
    ["philosophy", "personal-development"],
    ["philosophy/stoicism", "personal-development/discipline", "personal-development/character"]
  ),
  book(
    "the-republic",
    "The Republic",
    "Plato",
    "INTERMEDIATE",
    "A dialogue that starts with 'what is justice?' and ends up designing a city, a soul and an education.",
    ["philosophy", "politics"],
    ["philosophy/ethics", "philosophy/political-philosophy", "politics/democracy"]
  ),
  book(
    "nicomachean-ethics",
    "Nicomachean Ethics",
    "Aristotle",
    "INTERMEDIATE",
    "Virtue as a habit rather than a rule: what the good life is, and how character is built by practice.",
    ["philosophy", "personal-development"],
    ["philosophy/ethics", "personal-development/character", "personal-development/wisdom"]
  ),
  book(
    "the-consolation-of-philosophy",
    "The Consolation of Philosophy",
    "Boethius",
    "INTERMEDIATE",
    "Written in prison awaiting execution: fortune, providence and whether the good can be harmed.",
    ["philosophy", "theology", "literature"],
    ["philosophy/meaning-of-life", "theology/problem-of-evil", "literature/classic"]
  ),
  book(
    "justice-what-is-the-right-thing-to-do",
    "Justice: What's the Right Thing to Do?",
    "Michael Sandel",
    "BEGINNER",
    "Moral philosophy tested against live arguments — conscription, price gouging, markets in things that maybe shouldn't have one.",
    ["philosophy", "politics"],
    ["philosophy/ethics", "philosophy/political-philosophy", "politics/democracy"]
  ),
  book(
    "existentialism-is-a-humanism",
    "Existentialism Is a Humanism",
    "Jean-Paul Sartre",
    "INTERMEDIATE",
    "A lecture defending existentialism against the charge of despair: if existence precedes essence, you are what you choose.",
    ["philosophy"],
    ["philosophy/existentialism", "philosophy/free-will", "philosophy/meaning-of-life"]
  ),
  book(
    "summa-theologica-selected-questions",
    "Summa Theologica: Selected Questions",
    "Thomas Aquinas",
    "ADVANCED",
    "Objection, reply, objection, reply — the medieval method applied to God, law, virtue and the soul.",
    ["theology", "philosophy"],
    ["theology/existence-of-god", "theology/faith-and-reason", "philosophy/metaphysics"]
  ),

  // Literature of ideas
  book(
    "the-brothers-karamazov",
    "The Brothers Karamazov",
    "Fyodor Dostoevsky",
    "ADVANCED",
    "A murder, three brothers and the hardest form of the question: if there is a God, why do children suffer?",
    ["literature", "philosophy", "theology", "psychology"],
    ["literature/russian-literature", "theology/problem-of-evil", "philosophy/free-will"]
  ),
  book(
    "crime-and-punishment",
    "Crime and Punishment",
    "Fyodor Dostoevsky",
    "INTERMEDIATE",
    "A student decides he is exceptional enough to kill, then has to live inside the consequences.",
    ["literature", "psychology", "philosophy", "theology"],
    ["literature/russian-literature", "theology/redemption", "philosophy/morality"]
  ),
  book(
    "notes-from-underground",
    "Notes from Underground",
    "Fyodor Dostoevsky",
    "INTERMEDIATE",
    "A narrator who argues, brilliantly and unpleasantly, that people will choose their own harm just to prove they are free.",
    ["literature", "philosophy", "psychology"],
    ["literature/russian-literature", "philosophy/free-will", "philosophy/human-nature"]
  ),
  book(
    "the-death-of-ivan-ilyich",
    "The Death of Ivan Ilyich",
    "Leo Tolstoy",
    "BEGINNER",
    "A respectable man discovers, while dying, that the life he was so careful about may not have been his.",
    ["literature", "philosophy", "theology"],
    ["philosophy/mortality", "philosophy/meaning-of-life", "literature/classic"]
  ),
  book(
    "nineteen-eighty-four",
    "1984",
    "George Orwell",
    "BEGINNER",
    "Surveillance, rewritten history and a language engineered so that some thoughts can no longer be formed.",
    ["literature", "politics", "society"],
    ["literature/dystopia", "politics/totalitarianism", "society/modernity"]
  ),
  book(
    "brave-new-world",
    "Brave New World",
    "Aldous Huxley",
    "BEGINNER",
    "The other dystopia: nobody is oppressed, everybody is comfortable, and that is the problem.",
    ["literature", "politics", "technology", "society"],
    ["literature/dystopia", "politics/power", "society/modernity"]
  ),
  book(
    "the-divine-comedy",
    "The Divine Comedy",
    "Dante Alighieri",
    "ADVANCED",
    "A journey through hell, purgatory and paradise, in which the punishments are arguments about what sin does to a person.",
    ["literature", "theology", "philosophy"],
    ["literature/poetry", "literature/classic", "theology/salvation"]
  ),

  // Psychology and personal development
  book(
    "mans-search-for-meaning",
    "Man's Search for Meaning",
    "Viktor Frankl",
    "BEGINNER",
    "A psychiatrist's account of the camps, and the conclusion he drew: you cannot always choose your conditions, only your response.",
    ["psychology", "philosophy", "personal-development"],
    ["philosophy/meaning-of-life", "personal-development/suffering", "personal-development/hope"]
  ),
  book(
    "atomic-habits",
    "Atomic Habits",
    "James Clear",
    "BEGINNER",
    "Behaviour change treated as design: make the good thing obvious and easy, the bad thing awkward.",
    ["personal-development", "psychology"],
    ["personal-development/habits", "personal-development/discipline", "psychology/behaviour"]
  ),
  book(
    "deep-work",
    "Deep Work",
    "Cal Newport",
    "BEGINNER",
    "The case that sustained concentration is both increasingly rare and increasingly valuable, and how to protect it.",
    ["personal-development", "psychology", "technology"],
    ["personal-development/focus", "personal-development/discipline", "technology/attention"]
  ),
  book(
    "thinking-fast-and-slow",
    "Thinking, Fast and Slow",
    "Daniel Kahneman",
    "INTERMEDIATE",
    "Two systems of thought and the systematic errors of the fast one — the research behind most of what you've read about bias.",
    ["psychology", "economics"],
    ["psychology/cognition", "psychology/decision-making", "economics/behavioural-economics"]
  ),
  book(
    "the-righteous-mind",
    "The Righteous Mind",
    "Jonathan Haidt",
    "INTERMEDIATE",
    "Why decent people end up on opposite political sides: moral intuition arrives first, reasoning follows to justify it.",
    ["psychology", "politics", "philosophy"],
    ["psychology/moral-psychology", "philosophy/morality", "politics/democracy"]
  ),
  book(
    "how-to-win-friends-and-influence-people",
    "How to Win Friends and Influence People",
    "Dale Carnegie",
    "BEGINNER",
    "Old advice that keeps working, mostly because it amounts to taking a genuine interest in other people.",
    ["communication", "business", "personal-development"],
    ["communication/relationships", "communication/persuasion", "personal-development/character"]
  ),

  // Finance and investing
  book(
    "the-psychology-of-money",
    "The Psychology of Money",
    "Morgan Housel",
    "BEGINNER",
    "Short essays on why financial behaviour beats financial knowledge, and why enough is a number worth deciding on.",
    ["finance", "psychology", "investments"],
    ["finance/personal-finance", "finance/behavioural-finance", "psychology/decision-making"]
  ),
  book(
    "the-little-book-of-common-sense-investing",
    "The Little Book of Common Sense Investing",
    "John C. Bogle",
    "BEGINNER",
    "The argument for owning the whole market at the lowest possible cost, from the man who built the fund for it.",
    ["finance", "investments"],
    ["investments/index-investing", "investments/market-efficiency", "finance/personal-finance"]
  ),
  book(
    "a-random-walk-down-wall-street",
    "A Random Walk Down Wall Street",
    "Burton Malkiel",
    "INTERMEDIATE",
    "A survey of how prices behave and how badly forecasting them goes, ending in a practical allocation.",
    ["finance", "investments", "economics"],
    ["investments/market-efficiency", "investments/portfolio-construction", "finance/risk"]
  ),
  book(
    "the-intelligent-investor",
    "The Intelligent Investor",
    "Benjamin Graham",
    "ADVANCED",
    "Margin of safety, Mr Market, and the distinction between investment and speculation that the rest of the field is built on.",
    ["finance", "investments"],
    ["investments/value-investing", "finance/risk", "investments/portfolio-construction"]
  ),
  book(
    "against-the-gods",
    "Against the Gods",
    "Peter L. Bernstein",
    "INTERMEDIATE",
    "A history of risk: how humanity moved from fate and oracles to probability, insurance and the idea that the future can be measured.",
    ["finance", "history", "mathematics"],
    ["finance/risk", "finance/financial-history", "mathematics/probability"]
  ),
  book(
    "the-missing-billionaires",
    "The Missing Billionaires",
    "Victor Haghani and James White",
    "ADVANCED",
    "Why great fortunes vanish: not bad picks but bad sizing — how much to bet, in what, and for how long.",
    ["finance", "investments", "psychology"],
    ["investments/portfolio-construction", "finance/risk", "psychology/decision-making"]
  ),

  // Business and economics
  book(
    "the-personal-mba",
    "The Personal MBA",
    "Josh Kaufman",
    "BEGINNER",
    "A working vocabulary for business — value creation, marketing, sales, finance, systems — without the tuition.",
    ["business", "personal-development"],
    ["business/management", "business/entrepreneurship", "business/strategy"]
  ),
  book(
    "the-lean-startup",
    "The Lean Startup",
    "Eric Ries",
    "BEGINNER",
    "Treat a new product as an experiment: the smallest thing you can build to find out whether you were wrong.",
    ["business", "technology"],
    ["business/startups", "business/entrepreneurship", "technology/computing"]
  ),
  book(
    "the-mom-test",
    "The Mom Test",
    "Rob Fitzpatrick",
    "BEGINNER",
    "How to ask customers about their lives instead of about your idea, so that the answers mean something.",
    ["business", "communication"],
    ["business/startups", "communication/persuasion"]
  ),
  book(
    "influence",
    "Influence",
    "Robert Cialdini",
    "INTERMEDIATE",
    "Six levers of persuasion, documented well enough that the book doubles as a defence manual.",
    ["psychology", "business"],
    ["business/marketing", "psychology/decision-making", "psychology/behaviour"]
  ),
  book(
    "never-split-the-difference",
    "Never Split the Difference",
    "Chris Voss",
    "BEGINNER",
    "Negotiation from an FBI hostage negotiator: listening, labelling and calibrated questions rather than splitting the gap.",
    ["business", "communication"],
    ["communication/negotiation", "communication/persuasion"]
  ),
  book(
    "good-strategy-bad-strategy",
    "Good Strategy/Bad Strategy",
    "Richard Rumelt",
    "INTERMEDIATE",
    "Most 'strategy' is goals with adjectives. Real strategy diagnoses the problem and concentrates effort on it.",
    ["business"],
    ["business/strategy", "business/management"]
  ),
  book(
    "why-nations-fail",
    "Why Nations Fail",
    "Daron Acemoglu and James A. Robinson",
    "INTERMEDIATE",
    "Prosperity explained by institutions rather than geography or culture: who is allowed to participate, and who extracts.",
    ["economics", "politics", "history"],
    ["economics/institutions", "economics/growth", "history/modern-history"]
  ),
  book(
    "the-undercover-economist",
    "The Undercover Economist",
    "Tim Harford",
    "BEGINNER",
    "Everyday prices — coffee, rent, supermarkets — used to explain scarcity power, externalities and information.",
    ["economics", "finance", "society"],
    ["economics/markets", "society/institutions"]
  ),

  // Politics, history, science and technology
  book(
    "on-liberty",
    "On Liberty",
    "John Stuart Mill",
    "INTERMEDIATE",
    "The harm principle, and the argument that even opinions we're sure are wrong are worth hearing out.",
    ["politics", "philosophy"],
    ["politics/liberty", "philosophy/political-philosophy", "philosophy/ethics"]
  ),
  book(
    "the-prince",
    "The Prince",
    "Niccolò Machiavelli",
    "BEGINNER",
    "Politics described as it is practised rather than as it should be — which is why it still unsettles people.",
    ["politics", "philosophy", "history"],
    ["politics/power", "philosophy/political-philosophy", "history/intellectual-history"]
  ),
  book(
    "the-road-to-serfdom",
    "The Road to Serfdom",
    "Friedrich Hayek",
    "INTERMEDIATE",
    "The argument that central planning erodes the freedoms it promises to serve, written during the Second World War.",
    ["politics", "economics"],
    ["politics/liberty", "economics/institutions"]
  ),
  book(
    "the-communist-manifesto",
    "The Communist Manifesto",
    "Karl Marx and Friedrich Engels",
    "BEGINNER",
    "The short pamphlet that framed history as class struggle and shaped a century of politics — read it to argue with it.",
    ["politics", "economics", "history"],
    ["politics/power", "history/modern-history", "economics/institutions"]
  ),
  book(
    "the-origins-of-totalitarianism",
    "The Origins of Totalitarianism",
    "Hannah Arendt",
    "ADVANCED",
    "How antisemitism, imperialism and mass loneliness combined into a form of rule that needed constant motion.",
    ["politics", "philosophy", "history"],
    ["politics/totalitarianism", "history/modern-history", "philosophy/human-nature"]
  ),
  book(
    "prisoners-of-geography",
    "Prisoners of Geography",
    "Tim Marshall",
    "BEGINNER",
    "Ten maps and the constraints they impose: rivers, mountains and warm-water ports as permanent facts of foreign policy.",
    ["geopolitics", "history"],
    ["geopolitics/geography", "geopolitics/power", "history/modern-history"]
  ),
  book(
    "a-little-history-of-the-world",
    "A Little History of the World",
    "E. H. Gombrich",
    "BEGINNER",
    "World history told plainly, from the stone age onwards, without condescension — the best available first map.",
    ["history", "society"],
    ["history/ancient-world", "history/modern-history", "society/culture"]
  ),
  book(
    "the-demon-haunted-world",
    "The Demon-Haunted World",
    "Carl Sagan",
    "BEGINNER",
    "Science as a way of thinking rather than a body of facts, with a toolkit for detecting nonsense.",
    ["science", "philosophy"],
    ["science/scientific-method", "science/skepticism", "philosophy/critical-thinking"]
  ),
  book(
    "code-the-hidden-language",
    "Code",
    "Charles Petzold",
    "INTERMEDIATE",
    "From a torch and a switch to a working computer, one honest step at a time — no hand-waving anywhere.",
    ["technology", "science"],
    ["technology/computing", "technology/programming"]
  ),
  book(
    "chip-war",
    "Chip War",
    "Chris Miller",
    "INTERMEDIATE",
    "The semiconductor supply chain as the central fact of modern geopolitics, and how a handful of firms came to hold it.",
    ["technology", "geopolitics", "economics", "history"],
    ["technology/semiconductors", "geopolitics/supply-chains", "history/modern-history"]
  ),
];

/**
 * What each book is actually about, in four or five points.
 *
 * Themes and arguments, not facts about the object: no page counts, no
 * publication dates, no print runs. Those vary by edition and would be
 * invention dressed as data. What a book argues doesn't change between
 * printings, so it's safe to write down.
 *
 * Kept in its own map rather than inline so the list above stays readable and
 * a missing entry is a one-line test failure instead of a silent gap.
 */
export const BOOK_TOPICS: Record<string, string[]> = {
  "mere-christianity": [
    "Moral law as evidence for something beyond us",
    "What Christians actually agree on, stripped of denomination",
    "Pride as the central vice",
    "Virtue as something practised, not felt",
  ],
  "confessions-augustine": [
    "Memory, time and the shape of a self",
    "Desire misdirected rather than evil in itself",
    "Conversion as a slow turning, not a moment",
    "Grief, and what it reveals about love",
  ],
  "introduction-to-christianity": [
    "The Creed read line by line",
    "Faith as a stance, not a set of propositions",
    "Why the Incarnation is the hinge",
    "Reason and revelation as allies",
  ],
  "the-cost-of-discipleship": [
    "Cheap grace versus costly grace",
    "The Sermon on the Mount taken literally",
    "Obedience before understanding",
    "What following costs in practice",
  ],
  "the-orthodox-way": [
    "God as mystery rather than problem",
    "Prayer as the centre of theology",
    "Creation, fall and deification",
    "The Church as a way to walk",
  ],
  meditations: [
    "What is and isn't in your control",
    "Duty performed without applause",
    "Anger as a failure of understanding",
    "Mortality as a daily discipline",
  ],
  "the-republic": [
    "Justice in the soul and in the city",
    "The cave, and what education really is",
    "Why the philosopher shouldn't want to rule",
    "How democracies decay into tyranny",
  ],
  "nicomachean-ethics": [
    "Happiness as activity, not feeling",
    "Virtue as a mean between extremes",
    "Character built by repetition",
    "Friendship as part of the good life",
  ],
  "the-consolation-of-philosophy": [
    "Fortune's wheel and what it can't touch",
    "Why the wicked prospering isn't the whole story",
    "Providence and freedom held together",
    "The highest good as the only real good",
  ],
  "justice-what-is-the-right-thing-to-do": [
    "Utilitarianism and what it's willing to trade",
    "Rights that survive a majority vote",
    "Markets in things that maybe shouldn't have one",
    "Loyalty as a moral claim",
  ],
  "existentialism-is-a-humanism": [
    "Existence precedes essence",
    "Freedom as a condition you can't escape",
    "Anguish, abandonment and despair, defined precisely",
    "Why choosing for yourself is choosing for everyone",
  ],
  "summa-theologica-selected-questions": [
    "Five arguments for God's existence",
    "Objection and reply as a method of thinking",
    "Natural law and human law",
    "Virtue, grace and the ordering of the will",
  ],
  "the-brothers-karamazov": [
    "The Grand Inquisitor on freedom and bread",
    "Suffering children as the hardest objection",
    "Faith arrived at through doubt, not around it",
    "Everyone responsible for everything",
  ],
  "crime-and-punishment": [
    "The theory that some people are exempt",
    "Guilt as a physical condition",
    "Confession as the only way out",
    "Poverty, pride and the city itself",
  ],
  "notes-from-underground": [
    "Spite as proof of freedom",
    "Why reason doesn't govern behaviour",
    "Self-awareness as a kind of paralysis",
    "The refusal to be a piano key",
  ],
  "the-death-of-ivan-ilyich": [
    "A conventional life examined too late",
    "Illness stripping away pretence",
    "The lie everyone agrees to tell the dying",
    "Compassion from an unexpected quarter",
  ],
  "nineteen-eighty-four": [
    "History rewritten as a tool of power",
    "Newspeak: narrowing what can be thought",
    "Surveillance internalised",
    "Power sought for its own sake",
  ],
  "brave-new-world": [
    "Control by pleasure rather than fear",
    "Stability bought with everything else",
    "Conditioning from birth",
    "The right to be unhappy",
  ],
  "the-divine-comedy": [
    "Punishments that fit the shape of the sin",
    "Love as the force ordering everything",
    "Purgatory as repair rather than penalty",
    "Political and personal judgement intertwined",
  ],
  "mans-search-for-meaning": [
    "Survival tied to having a why",
    "The last freedom: choosing your response",
    "Logotherapy in outline",
    "Suffering with meaning versus suffering without",
  ],
  "atomic-habits": [
    "Systems beat goals",
    "Identity-based habits",
    "Make it obvious, attractive, easy, satisfying",
    "Compounding of small margins",
  ],
  "deep-work": [
    "Concentration as a rare and valuable skill",
    "Shallow work and why it fills the day",
    "Scheduling attention deliberately",
    "Boredom tolerance as a prerequisite",
  ],
  "thinking-fast-and-slow": [
    "Two systems: fast intuition, slow reasoning",
    "Anchoring, availability and framing",
    "Loss aversion and prospect theory",
    "The experiencing self versus the remembering self",
  ],
  "the-righteous-mind": [
    "Intuition first, reasoning second",
    "Six moral foundations",
    "Why the other side isn't stupid",
    "Groupishness as well as selfishness",
  ],
  "how-to-win-friends-and-influence-people": [
    "Criticism almost never works",
    "Genuine interest over technique",
    "Letting the other person own the idea",
    "Remembering what matters to people",
  ],
  "the-psychology-of-money": [
    "Behaviour matters more than knowledge",
    "Luck and risk as the same coin",
    "Room for error over optimisation",
    "Deciding what 'enough' means",
  ],
  "the-little-book-of-common-sense-investing": [
    "Costs compound against you",
    "Owning the whole market instead of picking",
    "Reversion to the mean",
    "Why most active funds trail",
  ],
  "a-random-walk-down-wall-street": [
    "Efficient markets and their limits",
    "Bubbles, from tulips to dot-coms",
    "Technical and fundamental analysis assessed",
    "A life-cycle guide to allocation",
  ],
  "the-intelligent-investor": [
    "Investment versus speculation",
    "Margin of safety",
    "Mr Market as a manic business partner",
    "Defensive and enterprising strategies",
  ],
  "against-the-gods": [
    "From fate and oracles to probability",
    "The birth of insurance and the actuarial idea",
    "Regression to the mean",
    "Why measured risk isn't the same as certainty",
  ],
  "the-missing-billionaires": [
    "Position sizing as the neglected decision",
    "Expected utility rather than expected return",
    "Spending rules that outlast a fortune",
    "Why great returns still end in nothing",
  ],
  "the-personal-mba": [
    "Value creation, marketing, sales, delivery, finance",
    "Systems thinking applied to a business",
    "Working with human psychology, not against it",
    "Which numbers actually tell you anything",
  ],
  "the-lean-startup": [
    "Build, measure, learn",
    "Minimum viable product",
    "Validated learning over vanity metrics",
    "Pivot or persevere",
  ],
  "the-mom-test": [
    "Ask about their life, not your idea",
    "Facts and commitments over compliments",
    "Bad data is worse than no data",
    "Getting to specifics fast",
  ],
  influence: [
    "Reciprocity, commitment, social proof",
    "Authority, liking, scarcity",
    "How compliance professionals use them",
    "Recognising them when they're used on you",
  ],
  "never-split-the-difference": [
    "Tactical empathy and labelling",
    "Calibrated 'how' questions",
    "Why 'no' is a beginning",
    "Anchors, deadlines and the last-minute ask",
  ],
  "good-strategy-bad-strategy": [
    "Diagnosis, guiding policy, coherent action",
    "Fluff and goals masquerading as strategy",
    "Concentrating force on a pivot point",
    "The discipline of saying no",
  ],
  "why-nations-fail": [
    "Inclusive versus extractive institutions",
    "Critical junctures and how they compound",
    "Why geography and culture explain less",
    "Creative destruction as a political threat",
  ],
  "the-undercover-economist": [
    "Scarcity power behind everyday prices",
    "Externalities and who pays for them",
    "Information asymmetry and lemon markets",
    "Why some countries stay poor",
  ],
  "on-liberty": [
    "The harm principle",
    "Freedom of thought and discussion",
    "The tyranny of the majority",
    "Individuality as a component of wellbeing",
  ],
  "the-prince": [
    "Politics as practised, not as preached",
    "Fortune, virtù and timing",
    "Feared or loved, and why",
    "Founding versus inheriting power",
  ],
  "the-road-to-serfdom": [
    "Planning and the knowledge problem",
    "Why central control needs coercion",
    "The rule of law as a constraint on power",
    "Economic freedom tied to every other kind",
  ],
  "the-communist-manifesto": [
    "History as class struggle",
    "Capital, labour and alienation",
    "The programme it actually proposed",
    "Its critique of the society it was born into",
  ],
  "the-origins-of-totalitarianism": [
    "Antisemitism and imperialism as precursors",
    "Loneliness as a political condition",
    "Terror as a system rather than a tool",
    "Ideology that must keep moving",
  ],
  "prisoners-of-geography": [
    "Rivers, mountains and warm-water ports",
    "Russia's plain and its strategic anxiety",
    "China, the sea and the first island chain",
    "How maps constrain foreign policy",
  ],
  "a-little-history-of-the-world": [
    "From the stone age to the modern era",
    "Empires, religions and revolutions in sequence",
    "How ideas travelled between civilisations",
    "A first map to hang later reading on",
  ],
  "the-demon-haunted-world": [
    "The baloney detection kit",
    "Why anecdote isn't evidence",
    "Pseudoscience and how it recruits",
    "Wonder as the point of the whole exercise",
  ],
  "code-the-hidden-language": [
    "Codes, bits and binary from first principles",
    "Relays and logic gates",
    "Building memory and an adder",
    "How a processor executes instructions",
  ],
  "chip-war": [
    "How the semiconductor industry took shape",
    "Lithography and the chokepoints in it",
    "Taiwan's position and what depends on it",
    "Export controls as economic weapons",
  ],
};

/**
 * The books, each carrying its topic list.
 *
 * The Bible keeps the lessons written for it in the spec; everything else gets
 * its entry from BOOK_TOPICS. Merged here rather than inline so a book without
 * topics fails a test rather than shipping blank.
 */
export const SEED_BOOKS: SeedResource[] = RAW_BOOKS.map((b) => {
  const rank = EDITORIAL_ORDER.indexOf(b.slug);

  // Categories are added, never removed: the hand-off and this codebase both
  // made reasonable calls, and dropping one would lose a shelf a book is on.
  const categories = Array.from(new Set([...b.categories, ...(HANDOFF_CATEGORIES[b.slug] ?? [])]));

  return {
    ...b,
    lessons: b.lessons ?? BOOK_TOPICS[b.slug]?.join("\n"),
    // The Bible's copy was specified verbatim and stays as written; the other
    // forty-nine take the hand-off's two-sentence descriptions.
    description: BOOK_DESCRIPTIONS[b.slug] ?? b.description,
    whyLearn: b.whyLearn ?? BOOK_WHY_LEARN[b.slug],
    categories,
    // A book missing from the order keeps whatever it had rather than being
    // silently pushed to the end of the shelf.
    editorialRank: rank === -1 ? b.editorialRank : rank + 1,
  };
});

/**
 * Courses, each with a URL verified on the institution's own site.
 *
 * Lesson counts are deliberately absent. Open Yale lists lectures per course
 * but the count wasn't confirmed for every one here, and a number that looks
 * official while being a guess is worse than no number — you'd plan against it.
 * Add them yourself as you start each course.
 */
export const SEED_COURSES: SeedResource[] = [
  {
    slug: "yale-financial-markets-shiller",
    type: "COURSE",
    title: "Financial Markets",
    creator: "Robert J. Shiller — Yale University",
    description:
      "An overview of the ideas, methods and institutions that let society manage risk and foster enterprise, with an introduction to behavioural finance.",
    whyLearn:
      "Shiller won a Nobel for work on asset prices and is unusually honest about how much of markets is psychology.",
    externalUrl: "https://oyc.yale.edu/economics/econ-252",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["economics", "finance"],
    subtags: ["economics/markets", "finance/behavioural-finance", "finance/risk"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Robert J. Shiller" },
  },
  {
    slug: "yale-introduction-political-philosophy",
    type: "COURSE",
    title: "Introduction to Political Philosophy",
    creator: "Steven B. Smith — Yale University",
    description:
      "Major texts of the Western political tradition: the polis, the sovereign state, constitutional government and democracy.",
    externalUrl: "https://oyc.yale.edu/political-science/plsc-114",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["philosophy", "politics"],
    subtags: ["philosophy/political-philosophy", "philosophy/ethics", "politics/democracy"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Steven B. Smith" },
  },
  {
    slug: "yale-philosophy-science-human-nature",
    type: "COURSE",
    title: "Philosophy and the Science of Human Nature",
    creator: "Tamar Gendler — Yale University",
    description:
      "Classic texts in ethics and political philosophy read alongside recent work in cognitive science.",
    externalUrl: "https://oyc.yale.edu/philosophy/phil-181",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["philosophy", "psychology"],
    subtags: ["philosophy/ethics", "philosophy/human-nature", "psychology/cognition"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Tamar Gendler" },
  },
  {
    slug: "yale-death-kagan",
    type: "COURSE",
    title: "Death",
    creator: "Shelly Kagan — Yale University",
    description:
      "What it means to die, whether death is the end, and which attitudes towards it survive scrutiny.",
    externalUrl: "https://oyc.yale.edu/death/phil-176",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["philosophy"],
    subtags: ["philosophy/mortality", "philosophy/metaphysics", "philosophy/meaning-of-life"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Shelly Kagan" },
  },
  {
    slug: "yale-introduction-psychology-bloom",
    type: "COURSE",
    title: "Introduction to Psychology",
    creator: "Paul Bloom — Yale University",
    description:
      "A survey of how people think and behave: perception, memory, language, development and mental illness.",
    externalUrl: "https://oyc.yale.edu/introduction-psychology/psyc-110",
    level: "BEGINNER",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["psychology"],
    subtags: ["psychology/cognition", "psychology/behaviour"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Paul Bloom" },
  },
  {
    slug: "yale-new-testament-martin",
    type: "COURSE",
    title: "Introduction to the New Testament History and Literature",
    creator: "Dale B. Martin — Yale University",
    description:
      "The New Testament read as a historical and literary document in its first-century context.",
    externalUrl: "https://oyc.yale.edu/religious-studies/rlst-152",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["theology", "history"],
    subtags: ["theology/christianity", "history/early-christianity", "history/historical-context"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Dale B. Martin" },
  },
  {
    slug: "yale-old-testament-hayes",
    type: "COURSE",
    title: "Introduction to the Old Testament (Hebrew Bible)",
    creator: "Christine Hayes — Yale University",
    description:
      "The Hebrew Bible in the context of the ancient Near East, read through modern scholarship.",
    externalUrl: "https://oyc.yale.edu/religious-studies/rlst-145",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["theology", "history"],
    subtags: ["theology/prophecy", "history/ancient-israel", "history/ancient-world"],
    meta: { platform: "Open Yale Courses", institution: "Yale University", instructor: "Christine Hayes" },
  },
  {
    slug: "stanford-human-behavioral-biology-sapolsky",
    type: "COURSE",
    title: "Human Behavioral Biology",
    creator: "Robert Sapolsky — Stanford University",
    description:
      "Behaviour explained from every angle at once: evolution, genetics, neuroscience, endocrinology and culture.",
    whyLearn:
      "Sapolsky refuses single-cause explanations for behaviour, which is the point of the whole course.",
    externalUrl: "https://www.youtube.com/playlist?list=PL848F2368C90DDC3D",
    level: "ADVANCED",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["psychology", "science"],
    subtags: ["psychology/biology-of-behaviour", "psychology/behaviour", "science/scientific-method"],
    meta: { platform: "YouTube", institution: "Stanford University", instructor: "Robert Sapolsky" },
  },
  {
    slug: "harvard-justice-sandel",
    type: "COURSE",
    title: "Justice: What's the Right Thing to Do?",
    creator: "Michael Sandel — Harvard University",
    description:
      "Moral and political philosophy applied to live arguments: markets, rights, equality and loyalty.",
    externalUrl: "https://sandel.scholars.harvard.edu/justice",
    level: "BEGINNER",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["philosophy", "politics"],
    subtags: ["philosophy/ethics", "philosophy/political-philosophy", "politics/democracy"],
    meta: { platform: "Harvard", institution: "Harvard University", instructor: "Michael Sandel" },
  },
  {
    slug: "mit-introduction-probability-statistics",
    type: "COURSE",
    title: "Introduction to Probability and Statistics",
    creator: "MIT OpenCourseWare",
    description:
      "Combinatorics, random variables, distributions, Bayesian inference, hypothesis testing and regression.",
    whyLearn:
      "Bayesian and frequentist inference taught side by side, which is rarer than it should be.",
    externalUrl:
      "https://ocw.mit.edu/courses/18-05-introduction-to-probability-and-statistics-spring-2022/",
    level: "INTERMEDIATE",
    language: "en",
    progressUnit: "LESSONS",
    categories: ["mathematics", "science"],
    subtags: ["mathematics/probability", "mathematics/statistics", "mathematics/inference"],
    meta: { platform: "MIT OpenCourseWare", institution: "Massachusetts Institute of Technology" },
  },
];

/**
 * Two sentences on each course: what it covers, and what sitting through it is
 * like. Written to the same rule as the books — themes, not statistics.
 */
export const COURSE_DESCRIPTIONS: Record<string, string> = {
  "yale-financial-markets-shiller":
    "Shiller walks through the institutions that let a society take risks — insurance, banking, " +
    "options, mortgages — and the behavioural forces that periodically break them. It is a survey " +
    "of finance told by someone who won a Nobel for showing how far prices drift from reason.",
  "yale-introduction-political-philosophy":
    "Smith reads the founding texts of Western political thought in order, from the Greek polis to " +
    "the modern state, asking each what it thinks authority is for. The reward is being able to " +
    "hear which of these arguments today's politics is quietly repeating.",
  "yale-philosophy-science-human-nature":
    "Gendler sets classic accounts of the good life beside what psychology has since found out " +
    "about how people actually decide and behave. Where the two disagree is the interesting part, " +
    "and the course refuses to settle it too quickly.",
  "yale-death-kagan":
    "Kagan asks whether death is bad, and whether the answer survives the arguments people usually " +
    "give for it — the soul, immortality, fear, suicide. It is unusually clear-headed and, for a " +
    "course about dying, unexpectedly practical about how to live.",
  "yale-introduction-psychology-bloom":
    "Bloom covers the whole field in one term: perception, memory, language, development, " +
    "disorder, and why people are so bad at predicting what will make them happy. A first course " +
    "that assumes nothing and still says something on every topic.",
  "yale-new-testament-martin":
    "Martin reads the New Testament as first-century literature written by particular people for " +
    "particular audiences, rather than as a single book. Useful whatever you believe, because it " +
    "shows how the texts came to be collected in the first place.",
  "yale-old-testament-hayes":
    "Hayes places the Hebrew Bible against the myths, laws and treaties of the ancient Near East " +
    "it grew up among. Reading it in that setting makes the familiar stories strange again, which " +
    "is the point.",
  "stanford-human-behavioral-biology-sapolsky":
    "Sapolsky explains a single act of behaviour from every distance at once: the second before, " +
    "the hormones that morning, the childhood, the genes, the evolutionary history. His argument " +
    "is that no one of these explanations is ever enough on its own.",
  "harvard-justice-sandel":
    "Sandel argues moral philosophy against a lecture hall of a thousand students, using cases " +
    "people actually disagree about — conscription, surrogacy, affirmative action, price gouging. " +
    "You watch positions get taken apart in real time, including your own.",
  "mit-introduction-probability-statistics":
    "A working introduction to probability and inference: distributions, Bayes, hypothesis " +
    "testing and regression, taught with both the Bayesian and frequentist accounts side by side. " +
    "Taught through notes and problem sets rather than recorded lectures.",
};

/** One line on why each course earns the time. */
export const COURSE_WHY_LEARN: Record<string, string> = {
  "yale-financial-markets-shiller":
    "The best available answer to what finance is actually for, from someone honest about its failures.",
  "yale-introduction-political-philosophy":
    "Gives you the original arguments, so you stop arguing with their modern paraphrases.",
  "yale-philosophy-science-human-nature":
    "Ethics tested against evidence rather than asserted — rare, and better for it.",
  "yale-death-kagan":
    "Thinking clearly about death turns out to change how you weigh almost everything else.",
  "yale-introduction-psychology-bloom":
    "One term that makes every later book on behaviour or decision-making easier to read.",
  "yale-new-testament-martin":
    "Historical context for the book this library puts first — read alongside it, not instead of it.",
  "yale-old-testament-hayes":
    "The other half of that context, and the more surprising one for most readers.",
  "stanford-human-behavioral-biology-sapolsky":
    "The definitive argument against single-cause explanations of why people do things.",
  "harvard-justice-sandel":
    "It teaches you to state the strongest version of the view you disagree with.",
  "mit-introduction-probability-statistics":
    "Both schools of inference in one place, which is rarer than it should be.",
};

/** Courses with their delivered copy and any verified playlist merged in. */
const COURSES: SeedResource[] = SEED_COURSES.map((c) => {
  const video = COURSE_VIDEOS[c.slug];
  return {
    ...c,
    description: COURSE_DESCRIPTIONS[c.slug] ?? c.description,
    whyLearn: COURSE_WHY_LEARN[c.slug] ?? c.whyLearn,
    meta: {
      ...c.meta,
      // Sapolsky's course has no separate site — the playlist *is* the course,
      // and it's already the main link. Setting it twice would render two
      // buttons pointing at the same page.
      videoUrl: video && video.url !== c.externalUrl ? video.url : undefined,
      lessonCount: video?.lessons,
    },
  };
});

/** Everything the seed button creates, books first. */
export const SEED_RESOURCES: SeedResource[] = [...SEED_BOOKS, ...COURSES];

/** Splits `category/subtag` into its parts; null for a malformed reference. */
export function parseSubtagRef(ref: string): { category: string; subtag: string } | null {
  const parts = ref.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { category: parts[0], subtag: parts[1] };
}
