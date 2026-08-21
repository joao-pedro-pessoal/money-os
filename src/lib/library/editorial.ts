/**
 * Editorial copy for the master book list, and the order it sits in.
 *
 * Delivered as a content hand-off (books.json, 2026-08-15) and merged in by
 * slug. Matching was done on the title rather than the slug: four slugs differ
 * between the hand-off and this codebase (`confessions` vs
 * `confessions-augustine`, `1984` vs `nineteen-eighty-four`, and two more), and
 * renaming a slug would orphan every row already in the database.
 *
 * The Bible is deliberately absent from DESCRIPTIONS and WHY_LEARN: its text
 * was specified verbatim earlier and stays as written. Everything about it that
 * the hand-off asserts — rank 1, hero, badge, subtitle — already matches.
 *
 * Pure data.
 */

/**
 * The shelf order.
 *
 * Rank is unique in the database, so this array is also the guarantee that no
 * two books claim the same position. Index 0 is rank 1.
 */
export const EDITORIAL_ORDER: string[] = [
  "the-holy-bible",
  "mere-christianity",
  "confessions-augustine",
  "introduction-to-christianity",
  "the-cost-of-discipleship",
  "the-orthodox-way",
  "meditations",
  "the-republic",
  "nicomachean-ethics",
  "the-consolation-of-philosophy",
  "justice-what-is-the-right-thing-to-do",
  "existentialism-is-a-humanism",
  "summa-theologica-selected-questions",
  "the-brothers-karamazov",
  "crime-and-punishment",
  "notes-from-underground",
  "the-death-of-ivan-ilyich",
  "nineteen-eighty-four",
  "brave-new-world",
  "the-divine-comedy",
  "mans-search-for-meaning",
  "atomic-habits",
  "deep-work",
  "thinking-fast-and-slow",
  "the-righteous-mind",
  "how-to-win-friends-and-influence-people",
  "the-psychology-of-money",
  "the-little-book-of-common-sense-investing",
  "a-random-walk-down-wall-street",
  "the-intelligent-investor",
  "against-the-gods",
  "the-missing-billionaires",
  "the-personal-mba",
  "the-lean-startup",
  "the-mom-test",
  "influence",
  "never-split-the-difference",
  "good-strategy-bad-strategy",
  "why-nations-fail",
  "the-undercover-economist",
  "on-liberty",
  "the-prince",
  "the-road-to-serfdom",
  "the-communist-manifesto",
  "the-origins-of-totalitarianism",
  "prisoners-of-geography",
  "a-little-history-of-the-world",
  "the-demon-haunted-world",
  "code-the-hidden-language",
  "chip-war",
];

/** Two sentences each: what it argues, and what reading it is like. */
export const BOOK_DESCRIPTIONS: Record<string, string> = {
  "mere-christianity":
    "Lewis builds a clear, nontechnical case for core Christian belief, beginning with moral " +
    "experience and moving toward God, freedom, sin, and transformation. It is especially useful " +
    "for readers who want to examine Christianity without first entering denominational disputes.",
  "confessions-augustine":
    "Augustine turns autobiography into an inquiry about desire, memory, time, wrongdoing, grace, " +
    "and the restless search for God. Readers interested in theology, psychology, or the history of " +
    "the self will find a remarkably modern interior portrait in an ancient work.",
  "introduction-to-christianity":
    "Ratzinger explains the Christian Creed as a demanding response to modern doubt rather than a " +
    "collection of inherited formulas. The book suits readers ready for a deeper account of faith, " +
    "reason, Christ, the Church, and the meaning of belief.",
  "the-cost-of-discipleship":
    "Bonhoeffer contrasts costly grace, which changes the whole life, with a comfortable faith that " +
    "asks nothing of the believer. Written under the shadow of political and ecclesial compromise, " +
    "it challenges Christians who want practice to match confession.",
  "the-orthodox-way":
    "Ware presents Eastern Christian theology through the mystery of God, the human person, prayer, " +
    "suffering, and union with the divine. It is a concise invitation to see theology not merely as " +
    "explanation but as a lived path of transformation.",
  "meditations":
    "These private reflections show a Roman emperor training his attention toward duty, " +
    "self-command, mortality, and acceptance of what lies beyond his control. The fragments reward " +
    "slow reading by turning Stoic ideas into practical exercises for daily conduct.",
  "the-republic":
    "Plato uses a conversation about justice to investigate education, political order, the soul, " +
    "truth, and the corruptions of power. Its ideal city is less a ready-made constitution than a " +
    "device for asking what makes a person and a society well ordered.",
  "nicomachean-ethics":
    "Aristotle asks what human flourishing consists of and argues that good character is formed " +
    "through practiced habits, practical wisdom, friendship, and rightly ordered pleasure. The book " +
    "is foundational for anyone who wants an ethics built around becoming good rather than merely " +
    "following rules.",
  "the-consolation-of-philosophy":
    "Awaiting execution, Boethius stages a dialogue with Lady Philosophy about fortune, happiness, " +
    "providence, freedom, and apparent injustice. The work helps readers confront loss by " +
    "distinguishing unstable external goods from goods that circumstance cannot easily remove.",
  "justice-what-is-the-right-thing-to-do":
    "Sandel introduces competing ideas of justice through vivid moral and political cases involving " +
    "markets, rights, equality, merit, and the common good. It is designed for readers who want to " +
    "understand why reasonable people reach sharply different conclusions about public life.",
  "existentialism-is-a-humanism":
    "Sartre defends existentialism against charges of despair and moral chaos by arguing that human " +
    "beings create themselves through choices made without guaranteed foundations. The lecture is a " +
    "concise entry into freedom, responsibility, authenticity, and the anxiety that accompanies " +
    "them.",
  "summa-theologica-selected-questions":
    "In carefully structured questions, Aquinas examines God, creation, human action, virtue, law, " +
    "grace, and the relationship between faith and reason. A selected edition gives serious readers " +
    "access to the architecture of medieval Christian thought without requiring the complete " +
    "multi-volume work.",
  "the-brothers-karamazov":
    "A family crisis becomes a vast investigation of faith, rebellion, guilt, freedom, love, and " +
    "responsibility. The novel is demanding but unusually rewarding for readers who want " +
    "philosophical and theological questions embodied in unforgettable, morally complicated people.",
  "crime-and-punishment":
    "After committing murder to test a theory of exceptional men, Raskolnikov discovers that an " +
    "idea cannot isolate him from conscience, suffering, and other people. The novel examines " +
    "rationalization, guilt, poverty, pride, repentance, and the possibility of moral renewal.",
  "notes-from-underground":
    "An embittered narrator attacks optimistic theories that reduce people to rational " +
    "self-interest and predictable social engineering. His contradictions expose pride, resentment, " +
    "self-sabotage, and the strange ways people may choose suffering simply to prove they remain " +
    "free.",
  "the-death-of-ivan-ilyich":
    "A respected official confronts terminal illness and gradually sees the emptiness of the " +
    "socially approved life he pursued. Tolstoy's short novel is a severe but compassionate " +
    "reflection on mortality, authenticity, compassion, and what makes a life truthful.",
  "nineteen-eighty-four":
    "Orwell imagines a regime that controls not only behavior but language, memory, evidence, and " +
    "the boundaries of thinkable thought. The novel remains essential for recognizing propaganda, " +
    "surveillance, historical revision, and the psychological destruction produced by total power.",
  "brave-new-world":
    "Huxley pictures a stable society maintained through engineered birth, conditioning, " +
    "entertainment, consumption, and easy pleasure rather than open terror. It asks whether freedom " +
    "can disappear because people are satisfied, distracted, and protected from every source of " +
    "depth.",
  "the-divine-comedy":
    "Dante's journey through Hell, Purgatory, and Paradise joins poetry, theology, politics, love, " +
    "and a complete moral vision of the cosmos. It rewards readers who want literature that treats " +
    "personal failure, justice, purification, and ultimate happiness on the grandest possible " +
    "scale.",
  "mans-search-for-meaning":
    "Frankl combines testimony from the concentration camps with an introduction to logotherapy, " +
    "his view that human beings are fundamentally oriented toward meaning. The book does not " +
    "romanticize suffering; it asks how freedom and responsibility can survive when circumstances " +
    "become radically constrained.",
  "atomic-habits":
    "Clear explains behavior change as the cumulative result of small systems involving cues, " +
    "cravings, responses, and rewards. The practical emphasis is on shaping identity and " +
    "environment so that useful actions become easier and harmful ones harder.",
  "deep-work":
    "Newport argues that sustained, distraction-free concentration is increasingly rare and " +
    "increasingly valuable in knowledge work. He combines that claim with routines for protecting " +
    "attention, reducing shallow obligations, and building the capacity to work deeply.",
  "thinking-fast-and-slow":
    "Kahneman surveys decades of research on intuitive and deliberate thinking, showing how " +
    "heuristics can produce both efficient judgments and predictable mistakes. Readers gain a " +
    "vocabulary for biases in estimation, risk, memory, forecasting, and economic choice.",
  "the-righteous-mind":
    "Haidt argues that moral judgment usually begins with intuition and is later defended by " +
    "reasoning, while different communities emphasize different moral foundations. The book helps " +
    "explain political polarization without assuming that one side has morality and the other " +
    "merely has ignorance.",
  "how-to-win-friends-and-influence-people":
    "Carnegie organizes practical principles for listening, handling disagreement, offering " +
    "criticism, and helping others feel respected. Some examples are dated, but the central " +
    "discipline of genuine attention remains useful in leadership, sales, friendship, and " +
    "negotiation.",
  "the-psychology-of-money":
    "Housel explains why financial outcomes depend as much on behavior, patience, expectations, and " +
    "personal history as on technical knowledge. Short essays explore compounding, risk, luck, " +
    "wealth, enoughness, and the value of room for error.",
  "the-little-book-of-common-sense-investing":
    "Bogle argues that most investors are best served by owning the broad market through low-cost " +
    "index funds and holding them for the long term. His case focuses on arithmetic: fees, " +
    "turnover, and failed attempts to outperform quietly reduce the return investors keep.",
  "a-random-walk-down-wall-street":
    "Malkiel explains why prices are difficult to predict consistently and compares speculation, " +
    "fundamental analysis, technical analysis, and diversified long-term investing. The book gives " +
    "ordinary investors a broad tour of market theory while repeatedly returning to cost, " +
    "discipline, and diversification.",
  "the-intelligent-investor":
    "Graham presents investing as the disciplined purchase of securities with a margin of safety, " +
    "sharply separated from speculation. His Mr. Market metaphor and emphasis on temperament remain " +
    "valuable even where specific instruments and examples have aged.",
  "against-the-gods":
    "Bernstein tells the intellectual history of risk, from probability and insurance to " +
    "statistics, portfolio theory, and modern finance. The narrative shows how quantifying " +
    "uncertainty changed commerce and decision-making while never eliminating surprise or human " +
    "judgment.",
  "the-missing-billionaires":
    "Haghani and White ask why fortunes that should have compounded into enormous dynastic wealth " +
    "so often disappeared. They use the question to develop a practical framework for sizing risk, " +
    "spending, diversification, and decision-making under uncertainty.",
  "the-personal-mba":
    "Kaufman gives a broad, concept-driven introduction to value creation, marketing, sales, " +
    "delivery, finance, systems, and human behavior in organizations. It is best used as a map that " +
    "helps founders and self-directed learners see how the main functions of a business connect.",
  "the-lean-startup":
    "Ries applies experimentation to entrepreneurship through the build-measure-learn loop, " +
    "validated learning, and careful choice of metrics. The approach challenges teams to test risky " +
    "assumptions early instead of perfecting products that customers may not want.",
  "the-mom-test":
    "Fitzpatrick explains how to talk with potential customers without inviting polite compliments " +
    "or pitching them into agreement. The method emphasizes past behavior, concrete problems, " +
    "commitments, and evidence that can actually change a product decision.",
  "influence":
    "Cialdini explains recurring principles that make requests persuasive, including reciprocity, " +
    "consistency, social proof, liking, authority, scarcity, and unity. The examples help readers " +
    "use these mechanisms ethically and recognize when marketers, institutions, or other people are " +
    "using them.",
  "never-split-the-difference":
    "Voss adapts hostage-negotiation techniques to ordinary conflicts, emphasizing tactical " +
    "empathy, calibrated questions, labeling emotions, and discovering hidden constraints. The " +
    "advice is useful when agreement depends less on formal logic than on making the other person " +
    "feel accurately understood.",
  "good-strategy-bad-strategy":
    "Rumelt distinguishes strategy from slogans, ambition, financial targets, and long lists of " +
    "initiatives. Good strategy diagnoses the central challenge, chooses a guiding approach, and " +
    "coordinates actions that concentrate strength where it matters.",
  "why-nations-fail":
    "Acemoglu and Robinson argue that long-run prosperity depends heavily on whether political and " +
    "economic institutions distribute opportunity broadly or concentrate power and extraction. " +
    "Wide-ranging historical cases make the thesis accessible while inviting debate about " +
    "geography, culture, state capacity, and contingency.",
  "the-undercover-economist":
    "Harford uses coffee shops, supermarkets, traffic, housing, globalization, and development to " +
    "reveal the incentives and trade-offs hidden inside everyday life. The book is an approachable " +
    "introduction to economic reasoning without requiring formal mathematics.",
  "on-liberty":
    "Mill defends individual freedom against both state coercion and the social pressure of the " +
    "majority, proposing harm to others as the main limit of liberty. His case for open debate " +
    "remains central to arguments about free speech, individuality, paternalism, and democratic " +
    "culture.",
  "the-prince":
    "Machiavelli analyzes how rulers acquire, preserve, and lose power in a world shaped by " +
    "conflict, fortune, fear, reputation, and imperfect loyalty. Whether read as advice, diagnosis, " +
    "or provocation, the work separates political effectiveness from conventional moral appearance.",
  "the-road-to-serfdom":
    "Hayek warns that comprehensive economic planning can concentrate discretionary power and " +
    "gradually undermine political freedom, even when planners begin with humane intentions. " +
    "Readers should engage it as a major liberal argument about knowledge, coordination, coercion, " +
    "and the limits of government design.",
  "the-communist-manifesto":
    "Marx and Engels interpret history through class conflict and describe capitalism as a " +
    "revolutionary system that transforms production, social relations, and the world market. The " +
    "pamphlet is essential for understanding socialist politics and should be read alongside both " +
    "its historical influence and the record of movements formed in its name.",
  "the-origins-of-totalitarianism":
    "Arendt investigates antisemitism, imperialism, statelessness, ideology, terror, and mass " +
    "society to understand the emergence of Nazi and Stalinist totalitarianism. The book resists " +
    "simple causal stories and asks what is historically new about domination that seeks to make " +
    "human beings entirely superfluous.",
  "prisoners-of-geography":
    "Marshall explains how mountains, rivers, plains, climate, resources, borders, and access to " +
    "the sea constrain the choices of states. The book is a readable introduction to geopolitical " +
    "thinking, provided geography is treated as a powerful constraint rather than a complete " +
    "destiny.",
  "a-little-history-of-the-world":
    "Gombrich narrates world history as a connected human story, moving from ancient civilizations " +
    "through empires, religions, revolutions, and modernity. Its simplicity makes it a strong first " +
    "map, to be supplemented later by more detailed and geographically diverse histories.",
  "the-demon-haunted-world":
    "Sagan defends scientific skepticism as a public habit of asking for evidence, testing " +
    "explanations, and recognizing how easily people can deceive themselves. He also argues that " +
    "science must be taught with wonder and humility if it is to compete with superstition and " +
    "confident misinformation.",
  "code-the-hidden-language":
    "Petzold builds computing from simple signals and switches toward binary arithmetic, logic " +
    "gates, memory, processors, software, and modern computer architecture. The explanations are " +
    "designed for curious readers who want to understand what sits beneath interfaces without " +
    "beginning from advanced mathematics.",
  "chip-war":
    "Miller traces how semiconductors became essential to economic power, military capability, " +
    "digital technology, and the rivalry among the United States, China, Taiwan, Japan, Korea, and " +
    "Europe. The book connects technical supply chains to industrial policy and geopolitical risk " +
    "without requiring an engineering background.",
};

/** One line on why it earns a place on the shelf. */
export const BOOK_WHY_LEARN: Record<string, string> = {
  "mere-christianity":
    "Use it as an accessible bridge between everyday moral reasoning and classical Christian " +
    "doctrine.",
  "confessions-augustine":
    "It shows how intellectual conviction, moral struggle, and personal conversion can belong to " +
    "one coherent story.",
  "introduction-to-christianity":
    "It offers an intellectually serious map of Christianity for readers living in a skeptical age.",
  "the-cost-of-discipleship":
    "It tests whether belief has become action, sacrifice, and disciplined character.",
  "the-orthodox-way":
    "It broadens a Christian library with the contemplative and sacramental vision of Eastern " +
    "Orthodoxy.",
  "meditations":
    "It is a durable manual for responding to pressure without surrendering judgment or character.",
  "the-republic":
    "It supplies many of the questions that later political philosophy continues to debate.",
  "nicomachean-ethics":
    "It gives a precise framework for connecting repeated action, character, and a flourishing " +
    "life.",
  "the-consolation-of-philosophy":
    "It shows philosophy functioning as moral therapy when status, wealth, and security collapse.",
  "justice-what-is-the-right-thing-to-do":
    "It provides a usable vocabulary for examining political disagreements beneath slogans and " +
    "party labels.",
  "existentialism-is-a-humanism":
    "It makes the existentialist account of radical responsibility accessible in a short, direct " +
    "form.",
  "summa-theologica-selected-questions":
    "It trains the reader to state objections fairly, distinguish concepts, and reason toward a " +
    "theological conclusion.",
  "the-brothers-karamazov":
    "It forces abstract arguments about God and morality to answer to lived suffering and human " +
    "relationships.",
  "crime-and-punishment":
    "It is a powerful study of how intelligent arguments can become shields against reality and " +
    "conscience.",
  "notes-from-underground":
    "It is a compact warning against theories of human behavior that leave no room for irrational " +
    "freedom.",
  "the-death-of-ivan-ilyich":
    "It uses death to clarify the difference between outward success and inwardly meaningful " +
    "living.",
  "nineteen-eighty-four":
    "It gives precise concepts for noticing when political language is being used to make truth " +
    "itself unstable.",
  "brave-new-world":
    "It complements 1984 by showing how control may operate through comfort and appetite rather " +
    "than fear alone.",
  "the-divine-comedy":
    "It reveals how a civilization's philosophy and theology can be transformed into imaginative " +
    "experience.",
  "mans-search-for-meaning":
    "It offers a sober framework for finding purpose without pretending that pain is easy or " +
    "deserved.",
  "atomic-habits":
    "It turns vague self-improvement goals into repeatable systems that can be measured and " +
    "adjusted.",
  "deep-work":
    "It helps convert attention from a constantly interrupted resource into a deliberate " +
    "professional advantage.",
  "thinking-fast-and-slow":
    "It makes recurring errors in judgment easier to identify in decisions about money, work, and " +
    "public policy.",
  "the-righteous-mind":
    "It improves the ability to understand moral disagreement before trying to persuade across it.",
  "how-to-win-friends-and-influence-people":
    "It teaches interpersonal habits that reduce defensiveness and make cooperation more likely.",
  "the-psychology-of-money":
    "It helps build a financial philosophy that can survive emotion, uncertainty, and changing " +
    "markets.",
  "the-little-book-of-common-sense-investing":
    "It provides the simplest strong baseline against which any more complicated investment " +
    "strategy should be judged.",
  "a-random-walk-down-wall-street":
    "It connects the case for passive investing to the evidence and institutions of real capital " +
    "markets.",
  "the-intelligent-investor":
    "It teaches that investment success depends on price, process, and emotional discipline—not " +
    "merely on finding good companies.",
  "against-the-gods":
    "It places today's financial risk tools inside the history of the ideas that made them " +
    "possible.",
  "the-missing-billionaires":
    "It links portfolio choices to survival, consumption, and the real objectives of a household " +
    "rather than return alone.",
  "the-personal-mba":
    "It supplies a practical business vocabulary before deeper specialization in any one function.",
  "the-lean-startup":
    "It offers a disciplined method for reducing uncertainty before committing large amounts of " +
    "time and capital.",
  "the-mom-test":
    "It turns customer conversations from vague validation into reliable learning.",
  "influence":
    "It provides a practical defense against manipulation as well as a framework for responsible " +
    "persuasion.",
  "never-split-the-difference":
    "It gives concrete language for slowing conflict down and uncovering the real structure of a " +
    "negotiation.",
  "good-strategy-bad-strategy":
    "It helps leaders replace vague aspiration with a coherent response to a specific obstacle.",
  "why-nations-fail":
    "It gives a strong institutional framework for comparing development across countries and " +
    "centuries.",
  "the-undercover-economist":
    "It trains the reader to look past prices and ask what incentives, scarcity, and market power " +
    "produced them.",
  "on-liberty":
    "It provides one of the clearest foundations for modern debates over freedom and legitimate " +
    "interference.",
  "the-prince":
    "It sharpens the ability to analyze power as it operates, not only as leaders claim it " +
    "operates.",
  "the-road-to-serfdom":
    "It presents the classic case that economic control and political liberty cannot be considered " +
    "separately.",
  "the-communist-manifesto":
    "It gives direct access to ideas that reshaped labor, revolution, political parties, and the " +
    "twentieth century.",
  "the-origins-of-totalitarianism":
    "It offers a demanding framework for distinguishing totalitarian rule from ordinary " +
    "dictatorship or authoritarianism.",
  "prisoners-of-geography":
    "It adds physical terrain to explanations that otherwise rely only on leaders, ideology, or " +
    "economics.",
  "a-little-history-of-the-world":
    "It gives beginners a chronological frame on which later historical knowledge can be placed.",
  "the-demon-haunted-world":
    "It equips readers with an accessible toolkit for evaluating extraordinary claims without " +
    "losing curiosity.",
  "code-the-hidden-language":
    "It replaces the mystery of computers with a layered mental model of how information becomes " +
    "computation.",
  "chip-war":
    "It explains why a tiny manufactured component now sits at the center of global strategy and " +
    "economic security.",
};

/**
 * Categories the hand-off assigns, as slugs in this app's taxonomy.
 *
 * Only used to *add* a category a book was missing — never to remove one. The
 * hand-off's subtags aren't imported: they overlap ours under different names
 * ("Meaning" against "Meaning of Life", "Virtue Ethics" against "Ethics") and
 * importing them would leave the taxonomy with near-duplicate tags that split
 * every search in two.
 */
export const HANDOFF_CATEGORIES: Record<string, string[]> = {
  "the-holy-bible": ["theology", "philosophy", "history", "literature", "personal-development"],
  "mere-christianity": ["theology", "philosophy"],
  "confessions-augustine": ["theology", "philosophy", "psychology", "literature"],
  "introduction-to-christianity": ["theology", "philosophy"],
  "the-cost-of-discipleship": ["theology", "personal-development"],
  "the-orthodox-way": ["theology", "philosophy"],
  "meditations": ["philosophy", "personal-development"],
  "the-republic": ["philosophy", "politics"],
  "nicomachean-ethics": ["philosophy", "personal-development"],
  "the-consolation-of-philosophy": ["philosophy", "theology", "literature"],
  "justice-what-is-the-right-thing-to-do": ["philosophy", "politics"],
  "existentialism-is-a-humanism": ["philosophy"],
  "summa-theologica-selected-questions": ["theology", "philosophy"],
  "the-brothers-karamazov": ["literature", "philosophy", "theology", "psychology"],
  "crime-and-punishment": ["literature", "psychology", "philosophy", "theology"],
  "notes-from-underground": ["literature", "philosophy", "psychology"],
  "the-death-of-ivan-ilyich": ["literature", "philosophy", "theology"],
  "nineteen-eighty-four": ["literature", "politics", "society"],
  "brave-new-world": ["literature", "politics", "technology", "society"],
  "the-divine-comedy": ["literature", "theology", "philosophy"],
  "mans-search-for-meaning": ["psychology", "philosophy", "personal-development"],
  "atomic-habits": ["personal-development", "psychology"],
  "deep-work": ["personal-development", "psychology", "technology"],
  "thinking-fast-and-slow": ["psychology", "economics"],
  "the-righteous-mind": ["psychology", "politics", "philosophy"],
  "how-to-win-friends-and-influence-people": ["communication", "business", "personal-development"],
  "the-psychology-of-money": ["finance", "psychology", "investments"],
  "the-little-book-of-common-sense-investing": ["finance", "investments"],
  "a-random-walk-down-wall-street": ["finance", "investments", "economics"],
  "the-intelligent-investor": ["finance", "investments"],
  "against-the-gods": ["finance", "history", "science"],
  "the-missing-billionaires": ["finance", "investments", "psychology"],
  "the-personal-mba": ["business", "personal-development"],
  "the-lean-startup": ["business", "technology"],
  "the-mom-test": ["business", "communication"],
  "influence": ["psychology", "business", "communication"],
  "never-split-the-difference": ["business", "communication"],
  "good-strategy-bad-strategy": ["business"],
  "why-nations-fail": ["economics", "politics", "history"],
  "the-undercover-economist": ["economics", "finance", "society"],
  "on-liberty": ["politics", "philosophy"],
  "the-prince": ["politics", "philosophy", "history"],
  "the-road-to-serfdom": ["politics", "economics"],
  "the-communist-manifesto": ["politics", "economics", "history"],
  "the-origins-of-totalitarianism": ["politics", "philosophy", "history"],
  "prisoners-of-geography": ["geopolitics", "history"],
  "a-little-history-of-the-world": ["history", "society"],
  "the-demon-haunted-world": ["science", "philosophy"],
  "code-the-hidden-language": ["technology", "science"],
  "chip-war": ["technology", "geopolitics", "economics", "history"],
};

