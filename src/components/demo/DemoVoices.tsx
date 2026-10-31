import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../ui/card";
import { TalkTime } from "../conversation/TalkTime";
import { ShownSpeaker, TranscriptView } from "../conversation/Transcript";
import { talkTime } from "../../helpers/talkTime.mjs";
import { speakerText } from "../../utils/speakerLabel";
import type { TourConversation } from "../../helpers/oatsTour.mjs";

/**
 * Who talked how much, once Finish has told the voices apart.
 *
 * Pressing a voice does what it does in the record: its bar turns honey and
 * the transcript shows only its turns. In the record the transcript is a tab
 * below; here it opens under the bars, and pressing the voice again, or
 * "Show everyone", closes it. A name here is not a button: naming a voice
 * writes the conversation, and the example is nobody's to write.
 */
export default function DemoVoices({ conversation }: { conversation: TourConversation }) {
  const { t } = useTranslation();
  const talk = useMemo(() => talkTime(conversation.segments), [conversation.segments]);
  const [selected, setSelected] = useState<string | null>(null);
  const shown = talk.speakers.find((speaker) => speaker.key === selected) ?? null;

  return (
    <div>
      <Card className="px-5 py-4">
        <TalkTime
          talk={talk}
          selected={shown?.key ?? null}
          onSelect={(key) => setSelected((current) => (current === key ? null : key))}
        />
      </Card>
      {shown && (
        <div className="oats-enter mt-6 px-1">
          <ShownSpeaker
            label={speakerText(shown.segment, t)}
            onEveryone={() => setSelected(null)}
          />
          <TranscriptView
            segments={conversation.segments}
            events={conversation.events}
            moments={conversation.moments}
            speaker={shown.key}
          />
        </div>
      )}
    </div>
  );
}
