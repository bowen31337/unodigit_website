/**
 * The questions people actually ask about a consultancy, answered in full.
 *
 * These exist for two audiences at once. For a visitor it is the FAQ block on
 * the home page; for an answer engine it is the FAQPage node in the JSON-LD
 * graph, and a Question with a self-contained Answer is the single most
 * quotable structure a page can offer — it is already the shape of the thing
 * the engine is trying to generate.
 *
 * WRITING RULES (they are what make this safe to publish as structured data):
 *  1. Every answer must be true and checkable against the rest of the site.
 *     No invented pricing, headcount, certifications, response times or
 *     client names. An answer engine will repeat these verbatim as fact.
 *  2. Answer in the first sentence, then elaborate. A hedged opening is the
 *     part that gets truncated into a snippet.
 *  3. Each answer stands alone — no "as mentioned above". It will be read
 *     out of context, because that is the entire point.
 *  4. Name the entity rather than saying "we", for the same reason: an
 *     extracted sentence has to carry its own subject.
 */
export interface Faq {
  q: string
  a: string
}

export const HOME_FAQS: Faq[] = [
  {
    q: 'What does Uno Digit do?',
    a: 'Uno Digit is an AI and digital transformation consultancy that helps enterprises put artificial intelligence into production. Its work covers six areas: AI strategy and consulting, machine learning solutions, data engineering, web and app development, process automation, and cloud and MLOps. Engagements are consulting-led rather than product sales — Uno Digit builds and deploys systems inside a client’s own environment.',
  },
  {
    q: 'Where is Uno Digit based?',
    a: 'Uno Digit is based in Sydney, New South Wales, Australia, and works with clients across Australia and internationally. Contact is by email at info@unodigit.com.au.',
  },
  {
    q: 'How does an engagement with Uno Digit work?',
    a: 'Uno Digit runs engagements in four stages: Discovery, a deep dive into the business challenge and objectives; Strategy, defining the roadmap and technical approach; Build, agile development with continuous feedback; and Deploy, launching, monitoring and iterating. The stages are sequential, and each one produces something the client keeps regardless of whether the next stage proceeds.',
  },
  {
    q: 'What kinds of AI problems does Uno Digit take on?',
    a: 'Uno Digit works on predictive analytics, natural language processing, computer vision, demand forecasting, recommendation systems and process automation. Published case studies include logistics route optimisation, predictive maintenance, e-commerce recommendation, supply chain automation and NLP for customer service. The common thread is applied machine learning against an operational business problem, not research.',
  },
  {
    q: 'How much does an AI project cost?',
    a: 'Cost depends on scope, and Uno Digit scopes each engagement individually rather than publishing fixed package prices. The fastest way to get a number is the assistant on this site: it runs a short requirements interview and produces an indicative quote range at the end. That range is indicative for budgeting and is confirmed after Discovery.',
  },
  {
    q: 'Does Uno Digit work with companies outside Sydney?',
    a: 'Yes. Uno Digit is based in Sydney but works with clients across Australia and worldwide. Delivery is remote-first, so location is not a constraint on the engagement.',
  },
  {
    q: 'How long has Uno Digit been operating?',
    a: 'Uno Digit was founded in 2018 and has grown from a small team of engineers into a full-service AI consultancy serving clients across Australia and beyond.',
  },
  {
    q: 'How do I get started with Uno Digit?',
    a: 'There are two routes. Use the assistant on this site to run a short requirements interview and receive an indicative quote, or email info@unodigit.com.au directly. Either way the next step is a Discovery conversation about the business problem before any technical commitment is made.',
  },
]
