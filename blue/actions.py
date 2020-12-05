""" 
    Here we create method to notify clients of actions.
    It is expected that the vuex store has actions to mirror.
"""
from .broadcast import broadcast_on_success


def added_site(site, accl=None):
    """ dispatch added_site """
    broadcast_on_success({"action": "added_site", "message": site}, accl)
    return site


def saved_preferences(preferences, accl=None):
    """ dispatch saved_preferences """
    broadcast_on_success(
        {"action": "saved_preferences", "message": preferences}, accl
    )
    return preferences


def added_permission(site_id, email, permission, accl=None):
    """ dispatch saved_preferences """
    message = {"site_id": site_id, "email": email, "permission": permission}
    broadcast_on_success(
        {"action": "added_permission", "message": message}, accl
    )
    return message


def removed_permission(site_id, email, accl=None):
    """ dispatch saved_preferences """
    message = {"site_id": site_id, "email": email}
    broadcast_on_success(
        {"action": "removed_permission", "message": message}, accl
    )
    return message
