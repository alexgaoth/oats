// Two personal conversations, so the demo has more than work in it: a family
// planning a weekend at a lake, and a call with a letting agent about a flat
// viewing. Short, invented, and filed in Personal (`group`), as the work ones
// are filed in Work. They are demo-profile only, like the rest of
// `supporting.mjs`, and share no subjects with Pellwood.
//
// The same rules as the review apply (see `launch-readiness-review.mjs`):
// question marks and wh-words only on questions, short first replies, and
// each topic opened by two turns that share its nouns.

const day = (daysAgo, hours, minutes) => Date.UTC(2026, 9, 12 - daysAgo, hours, minutes, 0);

export default [
  {
    id: "family-weekend-trip",
    group: "personal",
    startedAt: day(2, 26, 30),
    placement: { daysAgo: 2, at: "19:30" },
    company: "A family (fictional)",
    description: "Sample conversation: a family planning a weekend at a lake. Invented people.",
    title: "Weekend at the lake: the cabin, the late ferry and the dog",
    speakers: {
      nora: { name: "Nora", role: "Parent", rate: 2.05, gain: 1.0 },
      sam: { name: "Sam", role: "Parent", rate: 1.9, gain: 1.08 },
      ada: { name: "Ada", role: "Their daughter", rate: 2.3, gain: 0.86 },
    },
    turns: [
      ["nora", "Okay, the lake weekend. The cabin booking came through this morning."],
      ["sam", "Great. The lake cabin is ours from Friday evening to Sunday."],
      [
        "nora",
        "The cabin has two bedrooms and a wood stove, and the lake is a short walk from the porch.",
      ],
      ["ada", "Does the cabin have wifi?"],
      ["nora", "A little, near the porch only."],
      ["sam", "Then the cabin weekend is mostly offline. Good for everyone."],
      ["nora", "Next, the ferry. The ferry crossing books out on Fridays."],
      ["sam", "The early ferry leaves at four, and the late ferry at seven."],
      ["ada", "Can we take the late ferry? I have practice until five."],
      ["sam", "Yes, the late ferry works for me."],
      [
        "nora",
        "Then I'll book the late ferry tonight, with the car and three bikes.",
        { mark: { after: 1.4, note: "Book the late ferry: car and three bikes" } },
      ],
      ["sam", "The dog is the hard part. The cabin rules say no dogs."],
      ["nora", "My mother usually keeps the dog, but her knee is bad this month."],
      ["ada", "Could Grandma still keep the dog for two nights?"],
      ["nora", "No idea, honestly."],
      ["nora", "My mother gets a call from me tomorrow about the dog."],
      ["sam", "Then the food. The food shopping is mine, on Thursday."],
      ["nora", "Simple food, then. Pasta one night, and fish the other."],
      ["sam", "Pasta, fish, and pancakes for breakfast. Food for two dinners."],
      ["ada", "Can my friend Lily come too?"],
    ],
    summary: `
Nora, Sam and Ada planned the weekend at the lake: the cabin is booked, they take the late ferry, and the dog still needs somewhere to stay.

## Threads
- **Cabin.** Booked from Friday evening to Sunday: two bedrooms, a wood stove, and the lake a short walk from the porch. Wifi only near the porch.
- **Ferry.** The early crossing leaves at four and the late one at seven. Ada has practice until five, so the late ferry, with the car and three bikes.
- **Dog.** The cabin takes no dogs, and Nora's mother, who usually keeps him, has a bad knee this month. Whether she can is unknown.
- **Food.** Sam shops on Thursday: pasta one night, fish the other, pancakes for breakfast.

## Action items
- [ ] Nora: book the late ferry tonight.
- [ ] Nora: call her mother tomorrow about the dog.
- [ ] Sam: do the food shopping on Thursday.

## Follow-ups
- Whether Ada's friend Lily can come.
`,
  },
  {
    id: "flat-viewing-call",
    group: "personal",
    startedAt: day(4, 19, 40),
    placement: { daysAgo: 4, at: "12:40", weekdays: true },
    company: "A letting agency (fictional)",
    description:
      "Sample conversation: a call with a letting agent about a flat viewing. Invented people.",
    title: "Flat viewing: Saturday at eleven, the rent and the bike room",
    speakers: {
      leo: { name: "Leo", role: "Looking for a flat", rate: 2.0, gain: 1.02 },
      hana: { name: "Hana", role: "Letting agent", rate: 2.2, gain: 0.94 },
    },
    turns: [
      ["leo", "Hi Hana, it's Leo, about the flat on Alder Street."],
      ["hana", "Hi Leo. The Alder Street flat is still available, and the viewing slots are open."],
      ["leo", "Is a viewing on Saturday morning possible?"],
      ["hana", "Yes, Saturday at eleven works."],
      ["hana", "The tenant will be out on Saturday, so the viewing takes about twenty minutes."],
      ["leo", "Good. Saturday at eleven for the viewing, then."],
      ["leo", "On the rent, the listing says twelve hundred a month."],
      ["hana", "The rent is twelve hundred, with heating included in the rent."],
      ["leo", "Does the rent include electricity?"],
      ["hana", "Electricity is separate, around sixty a month."],
      ["hana", "The deposit is six weeks of rent, held in the deposit scheme."],
      ["leo", "Six weeks of rent for the deposit is fine."],
      ["leo", "One more thing. I cycle to work, so bike storage matters."],
      ["hana", "The building has a bike room in the basement, shared by the four flats."],
      ["leo", "Is there space for one more bike in the bike room?"],
      ["hana", "Hmm."],
      ["hana", "I'll check the bike room before Saturday."],
      ["leo", "And the move-in date. My notice runs to the end of next month."],
      [
        "hana",
        "The landlord wants a tenant from the first, so the move-in date is two weeks early for you.",
      ],
      ["leo", "Could the landlord accept a later move-in date?"],
      ["hana", "The landlord might, for a short let."],
    ],
    summary: `
Leo called Hana, the letting agent, about the flat on Alder Street. A viewing is set for Saturday at eleven, and the rent and the deposit work for him; the bike room and the move-in date are not settled.

## Threads
- **Viewing.** Saturday at eleven, about twenty minutes, while the tenant is out.
- **Rent and deposit.** 1,200 a month with heating included; electricity is separate, around 60 a month. The deposit is six weeks of rent, held in a deposit scheme.
- **Bike room.** A shared bike room in the basement for the four flats. Whether there is space for one more bike is not known yet.
- **Move-in date.** Leo's notice runs to the end of next month, and the landlord wants a tenant from the first. A later start might work as a short let.

## Action items
- [ ] Hana: check the bike room before Saturday.
- [ ] Leo: view the flat on Saturday at eleven.
`,
  },
];
