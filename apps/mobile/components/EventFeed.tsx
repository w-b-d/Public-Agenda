'use client';

import { ArrowRight, Clock, MapPin, Video } from 'lucide-react';
import { motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import type { Meeting } from '@/types/db';

type EventFeedProps = {
  countyId: string;
  branch: string;
  bodyId: string;
  upcoming: Meeting[];
  past: Meeting[];
  selectedDate: string | null;
  onClearDate: () => void;
};

export default function EventFeed({
  countyId,
  branch,
  bodyId,
  upcoming,
  past,
  selectedDate,
  onClearDate,
}: EventFeedProps) {
  const router = useRouter();

  const renderSection = (title: string, meetings: Meeting[]) => {
    if (meetings.length === 0) return null;

    return (
      <div className="space-y-12">
        <div className="flex items-center justify-between">
          <h4 className="text-2xl font-black tracking-tight text-primary">{title}</h4>
          {selectedDate ? (
            <button
              type="button"
              onClick={onClearDate}
              className="text-xs font-bold uppercase tracking-widest text-primary hover:opacity-70"
            >
              Clear Filter
            </button>
          ) : null}
        </div>

        {meetings.map((meeting, i) => {
          const start = new Date(meeting.start_time);
          const date = start.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
          });
          const day = start.toLocaleDateString([], { weekday: 'short' }).toUpperCase();

          return (
            <motion.div
              key={meeting.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group grid grid-cols-1 md:grid-cols-12 items-start py-8 px-4 hover:bg-surface-container-low transition-colors rounded-xl"
            >
              <div className="md:col-span-2 mb-4 md:mb-0">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-on-surface-variant">
                  {date}
                </p>
                <p className="text-2xl font-black text-primary">{day}</p>
              </div>

              <div className="md:col-span-10 flex flex-col md:flex-row md:items-start justify-between gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">
                      {meeting.title ? 'Public Meeting' : 'Scheduled Session'}
                    </p>
                  </div>

                  <h4 className="text-2xl font-bold text-primary mb-3">
                    {meeting.title ?? 'Untitled Meeting'}
                  </h4>

                  <p className="text-on-surface-variant leading-relaxed max-w-xl">
                    {meeting.description ??
                      'Official meeting record available. Open this event to view details, location, and related materials.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2 min-w-[220px]">
                  <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                    <Clock className="w-4 h-4" />
                    {formatDateTime(meeting.start_time)}
                  </div>

                  {meeting.location ? (
                    <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                      <MapPin className="w-4 h-4" />
                      {meeting.location}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        `/county/${countyId}/${branch}/${bodyId}/meeting/${meeting.id}`
                      )
                    }
                    className="mt-4 w-fit btn-primary"
                  >
                    View Meeting
                  </button>

                  {meeting.video_url ? (
                    <div className="mt-4 flex items-center gap-2 text-primary">
                      <Video className="w-5 h-5 fill-current" />
                      <span className="text-xs font-bold uppercase tracking-tighter">
                        Live Stream Available
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="max-w-4xl mx-auto mb-20 px-4 md:px-0">
      <div className="flex items-center justify-between mb-12">
        <div>
          <h3 className="text-4xl font-black tracking-tight text-primary">
            Chronicle of Events
          </h3>
          <p className="text-on-surface-variant mt-2">
            {selectedDate
              ? `Filtered by ${selectedDate}`
              : 'Browse upcoming and past meetings for this body.'}
          </p>
        </div>

        <button className="flex items-center gap-2 text-sm font-bold text-primary group transition-all">
          View Full Archive
          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      <div className="space-y-16">
        {renderSection('Upcoming', upcoming)}
        {renderSection('Past', past)}

        {upcoming.length === 0 && past.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant">
            No meetings on this day.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}