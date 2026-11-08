package com.jaeivan.gearopt;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Launches RuneLite with this plugin loaded: ./gradlew run */
public class GearExportPluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(GearExportPlugin.class);
		RuneLite.main(args);
	}
}
