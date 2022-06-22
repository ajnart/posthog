import json

from rest_framework import mixins, permissions, serializers, viewsets

from posthog.api.routing import StructuredViewSetMixin
from posthog.api.tagged_item import TaggedItemSerializerMixin, TaggedItemViewSetMixin
from posthog.constants import GROUP_TYPES_LIMIT
from posthog.exceptions import EnterpriseFeatureException
from posthog.filters import TermSearchFilterBackend, term_search_filter_sql
from posthog.models import PropertyDefinition
from posthog.permissions import OrganizationMemberPermissions, TeamMemberAccessPermission

# Properties generated by ingestion we don't want to show to users
HIDDEN_PROPERTY_DEFINITIONS = set(
    [
        # distinct_id is set in properties by some libraries
        "distinct_id",
        # used for updating properties
        "$set",
        "$set_once",
        # Group Analytics
        "$groups",
        "$group_type",
        "$group_key",
        "$group_set",
    ]
    + [f"$group_{i}" for i in range(GROUP_TYPES_LIMIT)],
)


class PropertyDefinitionSerializer(TaggedItemSerializerMixin, serializers.ModelSerializer):
    class Meta:
        model = PropertyDefinition
        fields = (
            "id",
            "name",
            "is_numerical",
            "query_usage_30_day",
            "property_type",
            "tags",
            # This is a calculated property, used only when "event_names" is passed to the API.
            "is_event_property",
        )

    def update(self, property_definition: PropertyDefinition, validated_data):
        raise EnterpriseFeatureException()


class PropertyDefinitionViewSet(
    TaggedItemViewSetMixin,
    StructuredViewSetMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = PropertyDefinitionSerializer
    permission_classes = [permissions.IsAuthenticated, OrganizationMemberPermissions, TeamMemberAccessPermission]
    lookup_field = "id"
    filter_backends = [TermSearchFilterBackend]
    ordering = "name"
    search_fields = ["name"]

    # implemented in /ee
    def get_object(self):
        id = self.kwargs["id"]
        return PropertyDefinition.objects.get(id=id)

    # implemented in /ee
    def get_queryset(self):

        name_filter, name_params = self._get_name_filter()
        numerical_filter = self._get_numerical_filter()
        event_names = self._get_event_names()
        excluded_properties = self._get_excluded_properties()
        event_property_field, event_property_filter = self._get_event_property_field()
        search_query, search_params = self._get_search_fields()

        params = {
            "event_names": tuple(event_names or []),
            "names": name_params,
            "team_id": self.team_id,
            "excluded_properties": tuple(set.union(set(excluded_properties or []), HIDDEN_PROPERTY_DEFINITIONS)),
            **search_params,
        }
        property_definition_fields = ", ".join(
            [f'"{f.column}"' for f in PropertyDefinition._meta.get_fields() if hasattr(f, "column")],  # type: ignore
        )

        return PropertyDefinition.objects.raw(
            f"""
                SELECT {property_definition_fields},
                       {event_property_field} AS is_event_property
                FROM posthog_propertydefinition
                WHERE team_id = %(team_id)s AND name NOT IN %(excluded_properties)s {name_filter} {numerical_filter} {search_query} {event_property_filter}
                ORDER BY is_event_property DESC, query_usage_30_day DESC NULLS LAST, name ASC
            """,
            params=params,
        )

    def _get_name_filter(self):
        properties_to_filter = self.request.GET.get("properties", None)
        if properties_to_filter:
            names = tuple(properties_to_filter.split(","))
            name_filter = "AND name IN %(names)s"
        else:
            names = ()
            name_filter = ""

        return name_filter, {"names": names}

    def _get_numerical_filter(self):
        if self.request.GET.get("is_numerical", None) == "true":
            numerical_filter = "AND is_numerical = true AND name NOT IN ('distinct_id', 'timestamp')"
        else:
            numerical_filter = ""

        return numerical_filter

    def _get_event_names(self):
        # Passed as JSON instead of duplicate properties like event_names[] to work with frontend's combineUrl
        event_names = self.request.GET.get("event_names", None)
        if event_names:
            event_names = json.loads(event_names)

        return event_names

    def _get_event_property_field(self):
        event_names = self._get_event_names()
        event_property_filter = ""
        if event_names and len(event_names) > 0:
            event_property_field = "(SELECT count(1) > 0 FROM posthog_eventproperty WHERE posthog_eventproperty.team_id=posthog_propertydefinition.team_id AND posthog_eventproperty.event IN %(event_names)s AND posthog_eventproperty.property = posthog_propertydefinition.name)"
            if self.request.GET.get("is_event_property", None) == "true":
                event_property_filter = f"AND {event_property_field} = true"
            elif self.request.GET.get("is_event_property", None) == "false":
                event_property_filter = f"AND {event_property_field} = false"
        else:
            event_property_field = "NULL"

        return event_property_field, event_property_filter

    def _get_excluded_properties(self):
        # Exclude by name
        excluded_properties = self.request.GET.get("excluded_properties", None)
        if excluded_properties:
            excluded_properties = json.loads(excluded_properties)

        return excluded_properties

    def _get_search_fields(self):

        search = self.request.GET.get("search", None)
        search_query, search_kwargs = term_search_filter_sql(self.search_fields, search)

        return search_query, search_kwargs
