package com.jaeivan.maxhit;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The JSON written to ~/.runelite/maxhit/&lt;account&gt;.json. Field names are the file format. */
class ExportState
{
	int version = 1;
	String account;
	String rsn;
	long updatedAt;
	/** 0 until the bank has been opened at least once with the plugin running. */
	long bankUpdatedAt;
	/** Real (unboosted) levels keyed like the DPS engine: atk, str, def, ranged, magic, prayer, hp, ... */
	Map<String, Integer> skills = new LinkedHashMap<>();
	/** Canonical item ids (un-noted, no placeholders), sorted, no quantities. */
	List<Integer> bank = new ArrayList<>();
	List<Integer> worn = new ArrayList<>();
	List<Integer> inventory = new ArrayList<>();
	/** Quest name (as RuneLite names it) -> NOT_STARTED or IN_PROGRESS. Finished quests are left out. */
	Map<String, String> unfinishedQuests;
	long questsUpdatedAt;
	/** Current slayer assignment, or null when you have none. */
	SlayerTask slayerTask;

	static class SlayerTask
	{
		/** Task name as the game's slayer table spells it (e.g. "Abyssal demons"). */
		String name;
		int remaining;

		@Override
		public boolean equals(Object o)
		{
			if (!(o instanceof SlayerTask))
			{
				return false;
			}
			SlayerTask t = (SlayerTask) o;
			return remaining == t.remaining && java.util.Objects.equals(name, t.name);
		}

		@Override
		public int hashCode()
		{
			return java.util.Objects.hash(name, remaining);
		}
	}

	ExportState normalized()
	{
		if (skills == null) skills = new LinkedHashMap<>();
		if (bank == null) bank = new ArrayList<>();
		if (worn == null) worn = new ArrayList<>();
		if (inventory == null) inventory = new ArrayList<>();
		return this;
	}
}
