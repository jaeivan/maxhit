package com.jaeivan.maxhit;

import net.runelite.client.RuneLite;
import net.runelite.client.externalplugins.ExternalPluginManager;

/** Launches RuneLite with this plugin loaded: ./gradlew run */
public class MaxHitPluginTest
{
	public static void main(String[] args) throws Exception
	{
		ExternalPluginManager.loadBuiltin(MaxHitPlugin.class);
		RuneLite.main(args);
	}
}
