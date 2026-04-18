import type { BodyCategory } from '@/types/db';

export interface Branch {
  slug: BodyCategory;
  label: string;
  blurb: string;
}

export const BRANCHES: Branch[] = [
  {
    slug: 'county_government',
    label: 'County Government',
    blurb: 'Board of Supervisors, Sheriff, and other county-wide offices.',
  },
  {
    slug: 'municipal_government',
    label: 'Municipal Governments',
    blurb: 'City councils and mayors within the county.',
  },
  {
    slug: 'special_district',
    label: 'Special Districts',
    blurb: 'Water, fire, healthcare, and other independent districts.',
  },
];
