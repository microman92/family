-- A linked participant must belong to the same family as the profile.
alter table public.family_members
  add constraint family_members_family_id_id_unique unique (family_id, id);

alter table public.member_profiles
  add constraint member_profiles_linked_member_same_family
  foreign key (family_id, linked_member_id)
  references public.family_members (family_id, id);
