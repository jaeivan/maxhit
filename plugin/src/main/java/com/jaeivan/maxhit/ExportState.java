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

	ExportState normalized()
	{
		if (skills == null) skills = new LinkedHashMap<>();
		if (bank == null) bank = new ArrayList<>();
		if (worn == null) worn = new ArrayList<>();
		if (inventory == null) inventory = new ArrayList<>();
		return this;
	}
}
