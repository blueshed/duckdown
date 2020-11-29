""" iam tools """
import logging
import boto3
from .store import store
from .utils import get_resource, get_bucket_arn, get_aws_region_account
from . import credentials


LOGGER = logging.getLogger(__name__)


def policy_exists(policy_name):
    """ return PolicyArn if policy_name exists """
    # create client
    client = boto3.client("iam")
    response = client.list_policies(Scope="Local")

    LOGGER.debug(response)

    policy_names = {
        policy["PolicyName"]: policy["Arn"] for policy in response["Policies"]
    }

    return policy_names.get(policy_name)


def get_policy(policy_arn):
    """ get policy body of policy_arn """
    # create client and get policy
    client = boto3.client("iam")
    response = client.get_policy(PolicyArn=policy_arn)

    LOGGER.debug(response)

    policy = response["Policy"]
    policy_version = policy["DefaultVersionId"]
    # get default policy version
    response = client.get_policy_version(
        PolicyArn=policy_arn, VersionId=policy_version
    )

    LOGGER.debug(response)
    # store result
    policy_doc = response["PolicyVersion"]["Document"]
    policy_name = policy_arn.split("/")[-1]
    store(f"policy-{policy_name}.json", policy_doc)

    return policy_doc


def _get_access_keys_(client, user_name):
    """ fetch a user access_keys """
    # create client and get policy
    response = client.list_access_keys(UserName=user_name)

    LOGGER.debug(response)
    return [
        item
        for item in response["AccessKeyMetadata"]
        if item["Status"] == "Active"
    ]


def _get_attached_policies_(client, user_name):
    # fetch attached_policies
    response = client.list_attached_user_policies(UserName=user_name)
    return response["AttachedPolicies"]


def get_user(user_name):
    """ fetch a user and their policies """
    # create client and get policy
    client = boto3.client("iam")
    response = client.get_user(UserName=user_name)

    LOGGER.debug(response)

    user = response["User"]

    # fetch attached_policies
    response = client.list_attached_user_policies(UserName=user_name)
    user["policies"] = _get_attached_policies_(client, user_name)
    user["access_keys"] = _get_access_keys_(client, user_name)

    store(f"user-{user_name}.json", user)

    return user


def create_user(user_name, bucket_name):
    """ create an iam user """
    region, _ = get_aws_region_account()
    bucket_arn = get_bucket_arn(bucket_name)

    # create client and get policy
    client = boto3.client("iam")
    response = client.create_user(
        UserName=user_name, Tags=[{"Key": "app", "Value": "duckdown"}]
    )
    LOGGER.debug(response)

    # set policy
    user_policy = get_resource("user_policy_tmpl.json").format(
        bucket_arn=bucket_arn
    )
    policy_name = f"{user_name}-duckdown"
    response = client.create_policy(
        PolicyName=policy_name,
        PolicyDocument=user_policy,
        Description="upload to duckdown",
    )
    LOGGER.debug(response)

    policy_arn = response["Policy"]["Arn"]
    response = client.attach_user_policy(
        UserName=user_name, PolicyArn=policy_arn
    )

    # set access keys
    response = client.create_access_key(UserName=user_name)
    LOGGER.debug(response)
    credentials.add_credentials(
        user_name,
        aws_access_key_id=response["AccessKey"]["AccessKeyId"],
        aws_secret_access_key=response["AccessKey"]["SecretAccessKey"],
        region=region,
    )

    return response


def delete_user(user_name):
    """ delete an iam user """
    # get the user
    user = get_user(user_name)

    # create a client
    client = boto3.client("iam")

    # Attached managed policies ( DetachUserPolicy )
    for policy in user["policies"]:
        policy_arn = policy["PolicyArn"]
        response = client.detach_user_policy(
            UserName=user_name, PolicyArn=policy_arn
        )
        LOGGER.debug(response)
        response = client.delete_policy(PolicyArn=policy_arn)
        LOGGER.debug(response)

    # Access keys ( DeleteAccessKey )
    for key in user["access_keys"]:
        key_id = key["AccessKeyId"]
        response = client.delete_access_key(
            UserName=user_name, AccessKeyId=key_id
        )
        LOGGER.debug(response)

    # delete the user
    response = client.delete_user(UserName=user_name)
    LOGGER.debug(response)
    return response
